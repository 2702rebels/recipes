/**
 * Synthetic camera scenes and object detection pipelines for the Object Detection pages. A small ray caster renders a
 * field with game pieces, robots, and a crowd. Two detectors then run on the image: a color pipeline (HSV threshold,
 * morphology, connected blobs, shape filters) and a simulated neural network (candidate boxes with confidences,
 * confidence threshold, non-maximum suppression). Pure functions with no React or DOM dependencies.
 *
 * Frames follow lib/vision.ts: world (field) frame x forward, y left, z up; camera frame x right, y down, z forward.
 */

import { cameraLookingAlong, DEFAULT_CAMERA, rng } from "./vision";

import type { CameraPose, Intrinsics, Vec3 } from "./vision";

/** Linear RGB, each channel 0 to 1. */
export type Rgb = [number, number, number];

/** An axis-aligned box in image pixels: left, top, right, bottom (right and bottom exclusive). */
export interface Box2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Game pieces and scenes.

/** HSV threshold in OpenCV units: hue 0-179 (degrees / 2), saturation and value 0-255. */
export interface HsvRange {
  hLo: number;
  hHi: number;
  sMin: number;
  vMin: number;
}

export type PieceId = "fuel" | "algae";

/** A ball-shaped game piece. */
export interface PieceKind {
  id: PieceId;
  name: string;
  /** Ball diameter (m). */
  diameter: number;
  /** Surface color, linear RGB. */
  albedo: Rgb;
  /** A threshold that finds this piece under the default lighting. */
  hsv: HsvRange;
}

/** sRGB 0-255 to linear RGB. */
const lin = (r: number, g: number, b: number): Rgb => [r, g, b].map((c) => (c / 255) ** 2.2) as Rgb;

/** The two game pieces the playground can show: 2026 fuel and 2025 algae. */
export const PIECES: Record<PieceId, PieceKind> = {
  fuel: {
    id: "fuel",
    name: "Fuel",
    diameter: 0.15,
    albedo: lin(240, 196, 30),
    hsv: { hLo: 18, hHi: 30, sMin: 150, vMin: 90 },
  },
  algae: {
    id: "algae",
    name: "Algae",
    diameter: 0.41,
    albedo: lin(30, 170, 160),
    hsv: { hLo: 80, hHi: 95, sMin: 140, vMin: 70 },
  },
};

export type SceneId = "scattered" | "cluster" | "robots";

/** What kind of thing a pixel shows. Only pieces count as correct detections. */
export type ObjectKind = "piece" | "bumper" | "robot" | "person" | "floor" | "tape" | "wall" | "stands";

/** A thing in the scene that can be hit by a ray. */
export interface SceneObject {
  id: number;
  kind: ObjectKind;
  label: string;
  albedo: Rgb;
  /** Ball center, for pieces. */
  center?: Vec3;
}

interface Sphere {
  id: number;
  c: Vec3;
  r: number;
}

interface AaBox {
  id: number;
  min: Vec3;
  max: Vec3;
}

/** A person in the stands: a shirt and a head on the crowd plane, in (y, z) meters. */
interface Person {
  id: number;
  y: number;
  z: number;
  shirt: Rgb;
}

/** A built scene: geometry plus a table of every object by id. */
export interface Scene {
  piece: PieceKind;
  objects: SceneObject[];
  spheres: Sphere[];
  boxes: AaBox[];
  people: Person[];
}

/** Field wall (the kickplate and the polycarbonate) and the crowd behind it, as planes at these x distances (m). */
const WALL_X = 7;
const CROWD_X = 9.5;
/** A white tape line across the field, between these x values (m). */
const TAPE = [2.6, 2.65];

const ID = { floor: 0, tape: 1, wall: 2, stands: 3 };
/** First id used for pieces, robots, and people. */
const FIRST_ID = 10;

/** Ball positions (x, y in meters) for each scene, before scaling for the piece size. */
const LAYOUTS: Record<SceneId, [number, number][]> = {
  scattered: [
    [1.4, 0.25],
    [2.1, -0.55],
    [3.0, 0.75],
    [3.6, -0.15],
    [4.6, 0.5],
    [6.0, -0.8],
  ],
  // A pile of touching balls, plus two loose ones. Filled in by `clusterLayout`.
  cluster: [],
  robots: [
    [2.0, 0.2],
    [3.35, 1.05],
    [3.55, -0.55],
    [4.3, -1.55],
  ],
};

/** A hexagonal pile of seven touching balls at 2.6 m, plus two loose balls. */
const clusterLayout = (d: number): [number, number][] => {
  const pile: [number, number][] = [[2.6, 0]];
  for (let k = 0; k < 6; k++) pile.push([2.6 + d * Math.cos((k * Math.PI) / 3), d * Math.sin((k * Math.PI) / 3)]);
  return [...pile, [1.5, -0.6], [4.2, 0.9]];
};

/** Robots (x, y, bumper color) for each scene. */
const ROBOTS: Record<SceneId, [number, number, "red" | "blue"][]> = {
  scattered: [[5.2, 1.6, "red"]],
  cluster: [[5.0, -1.4, "blue"]],
  robots: [
    [3.0, 1.0, "red"],
    [4.0, -1.0, "blue"],
  ],
};

const BUMPER: Record<"red" | "blue", Rgb> = { red: lin(200, 30, 35), blue: lin(30, 70, 200) };
const METAL = lin(150, 152, 156);
const CARPET = lin(88, 92, 90);
const WHITE = lin(235, 235, 230);
const STANDS = lin(28, 28, 32);
const SKIN = lin(200, 150, 120);
/** Shirt colors in the stands. Yellow and teal shirts look like the game pieces. */
const SHIRTS: Rgb[] = [
  lin(200, 40, 40),
  lin(40, 70, 190),
  lin(235, 190, 40),
  lin(40, 160, 150),
  lin(30, 30, 30),
  lin(230, 230, 230),
  lin(120, 120, 125),
  lin(60, 140, 60),
  lin(240, 120, 30),
];

/** Builds a scene with the chosen game piece and layout. */
export function buildScene(pieceId: PieceId, sceneId: SceneId): Scene {
  const piece = PIECES[pieceId];
  const r = piece.diameter / 2;
  const objects: SceneObject[] = [
    { id: ID.floor, kind: "floor", label: "carpet", albedo: CARPET },
    { id: ID.tape, kind: "tape", label: "tape line", albedo: WHITE },
    { id: ID.wall, kind: "wall", label: "field wall", albedo: METAL },
    { id: ID.stands, kind: "stands", label: "stands", albedo: STANDS },
  ];
  const spheres: Sphere[] = [];
  const boxes: AaBox[] = [];
  let next = FIRST_ID;

  // Big pieces need more room, so spread the layout out sideways for them.
  const spread = Math.max(1, piece.diameter / 0.15 / 1.6);
  const layout = sceneId === "cluster" ? clusterLayout(piece.diameter) : LAYOUTS[sceneId];
  layout.forEach(([x, y], i) => {
    const id = next++;
    const pos: Vec3 = [x, sceneId === "cluster" ? y : y * spread, r];
    objects.push({
      id,
      kind: "piece",
      label: `${piece.name.toLowerCase()} ${i + 1}`,
      albedo: piece.albedo,
      center: pos,
    });
    spheres.push({ id, c: pos, r });
  });

  for (const [x, y, color] of ROBOTS[sceneId]) {
    const bumperId = next++;
    const bodyId = next++;
    objects.push({ id: bumperId, kind: "bumper", label: `${color} bumper`, albedo: BUMPER[color] });
    objects.push({ id: bodyId, kind: "robot", label: "robot frame", albedo: METAL });
    boxes.push({ id: bumperId, min: [x - 0.45, y - 0.45, 0.03], max: [x + 0.45, y + 0.45, 0.16] });
    boxes.push({ id: bodyId, min: [x - 0.38, y - 0.38, 0.16], max: [x + 0.38, y + 0.38, 0.55] });
  }

  // The stands: rows of people, some seats empty. Seeded, so the crowd is the same every time.
  const rand = rng(2702);
  const people: Person[] = [];
  for (let row = 0; row < 6; row++) {
    for (let seat = -12; seat <= 12; seat++) {
      if (rand.uniform() < 0.3) continue;
      const id = next++;
      const shirt = SHIRTS[Math.floor(rand.uniform() * SHIRTS.length)];
      const y = seat * 0.62 + (rand.uniform() - 0.5) * 0.15;
      const z = 0.95 + row * 0.85 + (rand.uniform() - 0.5) * 0.1;
      people.push({ id, y, z, shirt });
      objects.push({ id, kind: "person", label: "person in the stands", albedo: shirt });
    }
  }
  return { piece, objects, spheres, boxes, people };
}

// ---------------------------------------------------------------------------------------------------------------------
// Camera and rendering.

/** Where the camera sits on the robot. */
export interface CameraMount {
  /** Lens height above the carpet (m). */
  height: number;
  /** Tilt below horizontal (degrees). Positive looks down. */
  pitchDeg: number;
}

/** The playground's camera: {@link DEFAULT_CAMERA} at half resolution (640×400, still 70° wide) to keep it fast. */
export const PLAYGROUND_CAMERA: Intrinsics = {
  ...DEFAULT_CAMERA,
  fx: DEFAULT_CAMERA.fx / 2,
  fy: DEFAULT_CAMERA.fy / 2,
  cx: DEFAULT_CAMERA.cx / 2,
  cy: DEFAULT_CAMERA.cy / 2,
  width: DEFAULT_CAMERA.width / 2,
  height: DEFAULT_CAMERA.height / 2,
};

/** The camera pose for a mount, at the field origin looking along +x. */
export const mountPose = (mount: CameraMount): CameraPose =>
  cameraLookingAlong([0, 0, mount.height], 0, (-mount.pitchDeg * Math.PI) / 180);

/** Direction of overhead light (toward the light). */
const LIGHT: Vec3 = (() => {
  const l: Vec3 = [0.25, 0.15, 1];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/**
 * A rendered scene before the camera's exposure is applied: per-pixel diffuse color (albedo times shading), specular
 * glare, and which object each pixel shows.
 */
export interface Rendered {
  K: Intrinsics;
  pose: CameraPose;
  width: number;
  height: number;
  /** Linear RGB, three floats per pixel. */
  diffuse: Float32Array;
  /** Glare from the overhead lights, one float per pixel. */
  specular: Float32Array;
  /** Object id per pixel. */
  ids: Int32Array;
}

/** Cheap hash noise in [0, 1) for the carpet texture. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ray casts the scene through every pixel of the playground camera. */
export function renderScene(scene: Scene, mount: CameraMount, K: Intrinsics = PLAYGROUND_CAMERA): Rendered {
  const { width, height } = K;
  const pose = mountPose(mount);
  const [ex, ey, ez] = pose.R;
  const o = pose.c;
  const diffuse = new Float32Array(width * height * 3);
  const specular = new Float32Array(width * height);
  const ids = new Int32Array(width * height);
  const albedoOf = new Map(scene.objects.map((ob) => [ob.id, ob.albedo]));

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const a = (u + 0.5 - K.cx) / K.fx;
      const b = (v + 0.5 - K.cy) / K.fy;
      // World ray direction: the camera's rows are its axes in the world.
      let dx = a * ex[0] + b * ey[0] + ez[0];
      let dy = a * ex[1] + b * ey[1] + ez[1];
      let dz = a * ex[2] + b * ey[2] + ez[2];
      const dn = Math.hypot(dx, dy, dz);
      dx /= dn;
      dy /= dn;
      dz /= dn;

      let t = Infinity;
      let id = -1;
      let n: Vec3 = [0, 0, 1];
      let albedo: Rgb = CARPET;
      let gloss = 0;
      let lightScale = 1;

      for (const s of scene.spheres) {
        const ox = o[0] - s.c[0];
        const oy = o[1] - s.c[1];
        const oz = o[2] - s.c[2];
        const bq = ox * dx + oy * dy + oz * dz;
        const cq = ox * ox + oy * oy + oz * oz - s.r * s.r;
        const disc = bq * bq - cq;
        if (disc < 0) continue;
        const ts = -bq - Math.sqrt(disc);
        if (ts > 1e-4 && ts < t) {
          t = ts;
          id = s.id;
          n = [(ox + ts * dx) / s.r, (oy + ts * dy) / s.r, (oz + ts * dz) / s.r];
          gloss = 0.18;
        }
      }

      for (const bx of scene.boxes) {
        // Slab test, tracking which face the ray enters through.
        let tNear = -Infinity;
        let tFar = Infinity;
        let axis = 0;
        let sign = 1;
        const d = [dx, dy, dz];
        let miss = false;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-12) {
            if (o[k] < bx.min[k] || o[k] > bx.max[k]) miss = true;
            continue;
          }
          let t1 = (bx.min[k] - o[k]) / d[k];
          let t2 = (bx.max[k] - o[k]) / d[k];
          let s = -1;
          if (t1 > t2) {
            [t1, t2] = [t2, t1];
            s = 1;
          }
          if (t1 > tNear) {
            tNear = t1;
            axis = k;
            sign = s;
          }
          tFar = Math.min(tFar, t2);
        }
        if (miss || tNear > tFar || tNear < 1e-4 || tNear >= t) continue;
        t = tNear;
        id = bx.id;
        n = [0, 0, 0];
        n[axis] = sign;
        gloss = 0.05;
      }

      if (id >= 0) {
        albedo = albedoOf.get(id) ?? CARPET;
      } else if (dz < 0 && -o[2] / dz < (WALL_X - o[0]) / Math.max(dx, 1e-9)) {
        // The carpet, with a little texture, and the tape line.
        t = -o[2] / dz;
        const x = o[0] + t * dx;
        const y = o[1] + t * dy;
        if (x >= TAPE[0] && x < TAPE[1]) {
          id = ID.tape;
          albedo = WHITE;
        } else {
          id = ID.floor;
          const k = 0.92 + 0.16 * hash(Math.floor(x * 40), Math.floor(y * 40));
          albedo = [CARPET[0] * k, CARPET[1] * k, CARPET[2] * k];
        }
        n = [0, 0, 1];
      } else if (dx > 1e-6) {
        // The field wall: a metal kickplate, clear polycarbonate, and a rail on top. Then the crowd behind it.
        const tw = (WALL_X - o[0]) / dx;
        const zw = o[2] + tw * dz;
        n = [-1, 0, 0];
        if (zw < 0.3 || (zw >= 0.5 && zw < 0.55)) {
          t = tw;
          id = ID.wall;
          albedo = METAL;
        } else {
          const tc = (CROWD_X - o[0]) / dx;
          const y = o[1] + tc * dy;
          const z = o[2] + tc * dz;
          t = tc;
          id = ID.stands;
          albedo = STANDS;
          lightScale = zw < 0.5 ? 0.45 : 0.55; // The stands are darker than the field, and dimmer behind the polycarbonate.
          for (const p of scene.people) {
            const inShirt = Math.abs(y - p.y) < 0.21 && z > p.z - 0.3 && z < p.z + 0.22;
            const inHead = Math.hypot(y - p.y, z - (p.z + 0.36)) < 0.11;
            if (inShirt || inHead) {
              id = p.id;
              albedo = inShirt ? p.shirt : SKIN;
              break;
            }
          }
        }
      } else {
        id = ID.stands;
        albedo = STANDS;
        lightScale = 0.3;
      }

      const lambert = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const shade = (0.45 + 0.55 * lambert) * lightScale;
      const i = v * width + u;
      diffuse[3 * i] = albedo[0] * shade;
      diffuse[3 * i + 1] = albedo[1] * shade;
      diffuse[3 * i + 2] = albedo[2] * shade;
      if (gloss > 0) {
        // Blinn-Phong highlight from the overhead lights.
        let hx = LIGHT[0] - dx;
        let hy = LIGHT[1] - dy;
        let hz = LIGHT[2] - dz;
        const hn = Math.hypot(hx, hy, hz);
        hx /= hn;
        hy /= hn;
        hz /= hn;
        specular[i] = gloss * Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz) ** 40;
      }
      ids[i] = id;
    }
  }
  return { K, pose, width, height, diffuse, specular, ids };
}

/** Venue lighting and camera settings applied to a {@link Rendered} scene. */
export interface Exposure {
  /** Venue light level, 1 is typical. */
  brightness: number;
  /** Color of the light: -1 is cool (blue), 0 neutral, +1 warm (orange). */
  cast: number;
  /** Camera exposure multiplier, 1 is typical. */
  exposure: number;
  /** Sensor noise, standard deviation in 0-255 units. */
  noise: number;
}

/** Light color for a cast value. */
export const castTint = (cast: number): Rgb => [1 + 0.35 * cast, 1, 1 - 0.45 * cast];

/** Applies lighting, exposure, gamma, and sensor noise. Returns 8-bit RGBA, ready to draw. */
export function exposeImage(r: Rendered, e: Exposure, seed = 1): Uint8ClampedArray {
  const n = r.width * r.height;
  const out = new Uint8ClampedArray(n * 4);
  const tint = castTint(e.cast);
  const gain = e.brightness * e.exposure;
  const noise = rng(seed);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const linear = (r.diffuse[3 * i + c] * tint[c] + r.specular[i]) * gain;
      const encoded = 255 * Math.min(1, Math.max(0, linear)) ** (1 / 2.2);
      out[4 * i + c] = encoded + (e.noise > 0 ? e.noise * noise.normal() : 0);
    }
    out[4 * i + 3] = 255;
  }
  return out;
}

/** Shrinks an RGBA image by an integer factor, averaging each block of pixels. */
export function downsample(img: Uint8ClampedArray, width: number, height: number, factor: number) {
  if (factor === 1) return { img, width, height };
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Uint8ClampedArray(w * h * 4);
  const area = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let j = 0; j < factor; j++)
          for (let k = 0; k < factor; k++) s += img[4 * ((y * factor + j) * width + x * factor + k) + c];
        out[4 * (y * w + x) + c] = s / area;
      }
      out[4 * (y * w + x) + 3] = 255;
    }
  }
  return { img: out, width: w, height: h };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ground truth.

/** A piece as the camera sees it, from the rendered object ids. */
export interface TruthPiece {
  id: number;
  label: string;
  /** Visible part of the piece, in playground camera pixels. */
  box: Box2;
  /** Visible pixels. */
  pixels: number;
  /** Visible pixels over the pixels it would cover with nothing in front and nothing cut off. */
  visibleFraction: number;
  center: Vec3;
}

/** Bounding box and pixel count of every object in view. */
export function objectExtents(r: Rendered) {
  const ext = new Map<number, Box2 & { pixels: number }>();
  for (let v = 0; v < r.height; v++) {
    for (let u = 0; u < r.width; u++) {
      const id = r.ids[v * r.width + u];
      const e = ext.get(id);
      if (!e) ext.set(id, { x0: u, y0: v, x1: u + 1, y1: v + 1, pixels: 1 });
      else {
        e.x0 = Math.min(e.x0, u);
        e.y0 = Math.min(e.y0, v);
        e.x1 = Math.max(e.x1, u + 1);
        e.y1 = Math.max(e.y1, v + 1);
        e.pixels++;
      }
    }
  }
  return ext;
}

/** Pieces with at least this many visible pixels count as "should be found". */
export const MIN_TRUTH_PIXELS = 12;

/** The pieces in view, nearest first. */
export function truthPieces(scene: Scene, r: Rendered): TruthPiece[] {
  const ext = objectExtents(r);
  const out: TruthPiece[] = [];
  for (const ob of scene.objects) {
    if (ob.kind !== "piece" || !ob.center) continue;
    const e = ext.get(ob.id);
    if (!e || e.pixels < MIN_TRUTH_PIXELS) continue;
    const depth = Math.hypot(ob.center[0] - r.pose.c[0], ob.center[1] - r.pose.c[1], ob.center[2] - r.pose.c[2]);
    const radiusPx = (r.K.fx * (scene.piece.diameter / 2)) / depth;
    out.push({
      id: ob.id,
      label: ob.label,
      box: { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 },
      pixels: e.pixels,
      visibleFraction: Math.min(1, e.pixels / (Math.PI * radiusPx * radiusPx)),
      center: ob.center,
    });
  }
  return out.sort((a, b) => a.center[0] - b.center[0]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Color pipeline.

/** Converts RGB (0-255) to OpenCV HSV: hue 0-179, saturation and value 0-255. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : (255 * d) / max;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (60 * (g - b)) / d;
    else if (max === g) h = 120 + (60 * (b - r)) / d;
    else h = 240 + (60 * (r - g)) / d;
    if (h < 0) h += 360;
  }
  return [h / 2, s, max];
}

/** Keeps pixels inside the HSV range: 1 if kept, 0 if not. A range with `hLo > hHi` wraps around red. */
export function hsvThreshold(img: Uint8ClampedArray, width: number, height: number, range: HsvRange): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const [h, s, v] = rgbToHsv(img[4 * i], img[4 * i + 1], img[4 * i + 2]);
    const hueOk = range.hLo <= range.hHi ? h >= range.hLo && h <= range.hHi : h >= range.hLo || h <= range.hHi;
    mask[i] = hueOk && s >= range.sMin && v >= range.vMin ? 1 : 0;
  }
  return mask;
}

/** One pass of 3×3 erosion (`keep = "all"`) or dilation (`keep = "any"`). Pixels outside the image are ignored. */
function morph(mask: Uint8Array, width: number, height: number, keep: "all" | "any"): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let any = 0;
      let all = 1;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= height) continue;
        for (let k = -1; k <= 1; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= width) continue;
          const m = mask[yy * width + xx];
          any |= m;
          all &= m;
        }
      }
      out[y * width + x] = keep === "all" ? all : any;
    }
  }
  return out;
}

/**
 * Cleans a mask with morphology. Opening (erode, then dilate) removes specks smaller than the kernel. Closing (dilate,
 * then erode) fills small holes and gaps. Each step repeats `open` or `close` times.
 */
export function cleanMask(mask: Uint8Array, width: number, height: number, open: number, close: number) {
  let m = mask;
  for (let i = 0; i < open; i++) m = morph(m, width, height, "all");
  for (let i = 0; i < open; i++) m = morph(m, width, height, "any");
  for (let i = 0; i < close; i++) m = morph(m, width, height, "any");
  for (let i = 0; i < close; i++) m = morph(m, width, height, "all");
  return m;
}

/** A connected group of mask pixels. */
export interface Blob {
  box: Box2;
  /** Pixels in the blob. */
  area: number;
}

/** Finds 8-connected blobs in a mask, largest first. */
export function findBlobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const label = new Int32Array(mask.length).fill(-1);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const box = { x0: width, y0: height, x1: 0, y1: 0 };
    let area = 0;
    label[start] = blobs.length;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x + 1);
      box.y1 = Math.max(box.y1, y + 1);
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          const xx = x + k;
          const yy = y + j;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const q = yy * width + xx;
          if (mask[q] && label[q] < 0) {
            label[q] = blobs.length;
            stack.push(q);
          }
        }
      }
    }
    blobs.push({ box, area });
  }
  return blobs.sort((a, b) => b.area - a.area);
}

/** Shape filters for blobs. */
export interface BlobFilter {
  /** Smallest blob to keep, as a percentage of the image area. */
  minAreaPct: number;
  /** Largest allowed width-to-height ratio, either way round. A ball is 1. */
  maxAspect: number;
  /** Smallest allowed fill: blob pixels over box pixels. A ball fills π/4 ≈ 0.79 of its box. */
  minFill: number;
  /** Drop blobs whose bottom is above the horizon. Game pieces on the floor are always below it. */
  belowHorizon: boolean;
}

export type RejectReason = "area" | "aspect" | "fill" | "horizon";

/** Why a blob was dropped, or null if it passes. `horizonY` is the horizon row in the blob's image. */
export function rejectReason(b: Blob, f: BlobFilter, imageArea: number, horizonY: number): RejectReason | null {
  const w = b.box.x1 - b.box.x0;
  const h = b.box.y1 - b.box.y0;
  if ((100 * b.area) / imageArea < f.minAreaPct) return "area";
  if (f.belowHorizon && b.box.y1 <= horizonY) return "horizon";
  if (Math.max(w / h, h / w) > f.maxAspect) return "aspect";
  if (b.area / (w * h) < f.minFill) return "fill";
  return null;
}

/** Image row of the horizon (a level line through the camera), which may be off the image. */
export const horizonRow = (K: Intrinsics, mount: CameraMount) =>
  K.cy - K.fy * Math.tan((mount.pitchDeg * Math.PI) / 180);

// ---------------------------------------------------------------------------------------------------------------------
// Simulated neural network detector.

/** Model and hardware choices for the simulated network. */
export interface NetworkSetup {
  /** Side of the square model input (px). The camera image is scaled down to fit it. */
  inputSize: number;
  /** Trained on images from many venues, or only one. */
  training: "varied" | "single";
}

/** A box the network proposes, before or after post-processing. */
export interface Candidate {
  box: Box2;
  confidence: number;
  /** The scene object that caused it, or -1 for background clutter. */
  source: number;
}

/** Fraction of the pixels in the playground image that one model input pixel covers, per side. */
export const modelScale = (inputSize: number, K: Intrinsics = PLAYGROUND_CAMERA) => inputSize / K.width;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Hue (degrees) and saturation (0-1) of a linear color, after gamma. */
const hueSat = (c: Rgb): [number, number] => {
  const [h, s] = rgbToHsv(c[0] ** (1 / 2.2) * 255, c[1] ** (1 / 2.2) * 255, c[2] ** (1 / 2.2) * 255);
  return [h * 2, s / 255];
};

/**
 * Stands in for a single-stage detector such as a YOLO-style network. It does not run a real model. It produces the
 * kind of raw output one does:
 *
 * - **Real pieces** get a box with a confidence that falls off once the piece is less than about 8 model pixels
 *   across, when it is mostly hidden or cut off, when it is too dark or blown out, and (for a model trained at one
 *   venue only) when the lighting differs from that venue.
 * - **Each piece also gets two shifted, weaker duplicate boxes**, as neighboring grid cells fire on the same object.
 *   Non-maximum suppression is what removes them.
 * - **Things that look like the piece** (same hue) get low-confidence false boxes, and so does random background
 *   clutter.
 */
export function simulateNetwork(
  scene: Scene,
  r: Rendered,
  img: Uint8ClampedArray,
  exposure: Exposure,
  setup: NetworkSetup,
  seed = 7
): Candidate[] {
  const rand = rng(seed);
  const jitter = (s: number) => rand.normal() * s;
  const scale = modelScale(setup.inputSize, r.K);
  const ext = objectExtents(r);
  const truth = truthPieces(scene, r);
  const single = setup.training === "single";
  const out: Candidate[] = [];

  // How bright and how blown out each object's pixels are.
  const tone = new Map<number, { sum: number; clipped: number; n: number }>();
  for (let i = 0; i < r.width * r.height; i++) {
    const id = r.ids[i];
    const v = Math.max(img[4 * i], img[4 * i + 1], img[4 * i + 2]);
    const t = tone.get(id) ?? { sum: 0, clipped: 0, n: 0 };
    t.sum += v;
    t.clipped += Math.min(img[4 * i], img[4 * i + 1], img[4 * i + 2]) >= 250 ? 1 : 0;
    t.n++;
    tone.set(id, t);
  }
  const gain = exposure.brightness * exposure.exposure;
  const venue = single ? Math.exp(-((Math.log2(gain) / 1.6) ** 2) - (exposure.cast / 0.8) ** 2) : 1;

  for (const p of truth) {
    const w = p.box.x1 - p.box.x0;
    const h = p.box.y1 - p.box.y0;
    const size = Math.max(w, h) * scale;
    const t = tone.get(p.id)!;
    const meanV = t.sum / t.n;
    const dark = Math.min(1, meanV / 55);
    const blown = 1 - 0.8 * (t.clipped / t.n);
    const noise = 1 - Math.min(0.5, exposure.noise / 60);
    const conf =
      0.96 * sigmoid((size - 8) / 1.8) * p.visibleFraction ** 0.8 * dark * blown * venue * noise + jitter(0.03);
    if (conf < 0.02) continue;
    const s = Math.max(w, h);
    const box = {
      x0: p.box.x0 + jitter(0.05 * s),
      y0: p.box.y0 + jitter(0.05 * s),
      x1: p.box.x1 + jitter(0.05 * s),
      y1: p.box.y1 + jitter(0.05 * s),
    };
    out.push({ box, confidence: Math.min(0.99, conf), source: p.id });
    for (let k = 0; k < 2; k++) {
      const ang = rand.uniform() * 2 * Math.PI;
      const shift = (0.06 + 0.16 * rand.uniform()) * s;
      const grow = 0.9 + 0.2 * rand.uniform();
      const cx = (box.x0 + box.x1) / 2 + shift * Math.cos(ang);
      const cy = (box.y0 + box.y1) / 2 + shift * Math.sin(ang);
      out.push({
        box: { x0: cx - (w * grow) / 2, y0: cy - (h * grow) / 2, x1: cx + (w * grow) / 2, y1: cy + (h * grow) / 2 },
        confidence: conf * (0.45 + 0.3 * rand.uniform()),
        source: p.id,
      });
    }
  }

  // Look-alikes: bumpers and shirts with a hue close to the piece's.
  const [pieceHue] = hueSat(scene.piece.albedo);
  for (const ob of scene.objects) {
    if (ob.kind !== "bumper" && ob.kind !== "person") continue;
    const e = ext.get(ob.id);
    if (!e || e.pixels < 30) continue;
    const [hue, sat] = hueSat(ob.albedo);
    const dh = Math.min(Math.abs(hue - pieceHue), 360 - Math.abs(hue - pieceHue));
    const looks = Math.exp(-((dh / 28) ** 2)) * sat * (ob.kind === "bumper" ? 0.55 : 0.75);
    const conf = 0.5 * looks * (single ? 1.6 : 1) + jitter(0.03);
    if (conf < 0.05) continue;
    // The network fires on a piece-sized patch of the look-alike.
    const side = Math.min(e.x1 - e.x0, e.y1 - e.y0);
    const cx = e.x0 + side / 2 + rand.uniform() * (e.x1 - e.x0 - side);
    const cy = e.y0 + side / 2 + rand.uniform() * (e.y1 - e.y0 - side);
    out.push({
      box: { x0: cx - side / 2, y0: cy - side / 2, x1: cx + side / 2, y1: cy + side / 2 },
      confidence: Math.min(0.9, conf),
      source: ob.id,
    });
  }

  // Background clutter: weak boxes on nothing in particular.
  for (let k = 0; k < 5; k++) {
    const side = 8 + 30 * rand.uniform();
    const cx = rand.uniform() * r.width;
    const cy = r.height * (0.3 + 0.7 * rand.uniform());
    out.push({
      box: { x0: cx - side / 2, y0: cy - side / 2, x1: cx + side / 2, y1: cy + side / 2 },
      confidence: (0.04 + 0.22 * rand.uniform()) * (single ? 1.5 : 1),
      source: -1,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Intersection over union of two boxes: 0 if they don't touch, 1 if they are the same. */
export function iou(a: Box2, b: Box2): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const area = (q: Box2) => (q.x1 - q.x0) * (q.y1 - q.y0);
  return inter / (area(a) + area(b) - inter);
}

/**
 * Non-maximum suppression. Goes through boxes from most to least confident, and drops any box that overlaps an
 * already kept box by more than `iouThreshold`. Returns the index of the kept box that suppressed each one, or -1 if it
 * was kept.
 */
export function nms(boxes: Box2[], iouThreshold: number): number[] {
  const by = new Array<number>(boxes.length).fill(-1);
  const kept: number[] = [];
  boxes.forEach((b, i) => {
    const winner = kept.find((k) => iou(boxes[k], b) > iouThreshold);
    if (winner === undefined) kept.push(i);
    else by[i] = winner;
  });
  return by;
}

// ---------------------------------------------------------------------------------------------------------------------
// From a box to the robot, and scoring.

/**
 * Where a detected ball is, from its box: the ray through the box center, intersected with a level plane at the
 * ball's center height. Returns the horizontal distance from the camera (m) and the angle to it (degrees, positive to
 * the left, as WPILib measures yaw), or null if the ray doesn't reach the plane.
 */
export function locateBall(box: Box2, r: Rendered, ballRadius: number) {
  const u = (box.x0 + box.x1) / 2;
  const v = (box.y0 + box.y1) / 2;
  const a = (u - r.K.cx) / r.K.fx;
  const b = (v - r.K.cy) / r.K.fy;
  const [ex, ey, ez] = r.pose.R;
  const d: Vec3 = [0, 1, 2].map((k) => a * ex[k] + b * ey[k] + ez[k]) as Vec3;
  const drop = r.pose.c[2] - ballRadius;
  if (d[2] >= 0 || drop <= 0) return null;
  const t = drop / -d[2];
  const x = t * d[0];
  const y = t * d[1];
  return { distance: Math.hypot(x, y), yawDeg: (Math.atan2(y, x) * 180) / Math.PI };
}

/** The true distance (m) and angle (degrees, left positive) from the camera to a piece center. */
export const truthLocation = (p: TruthPiece, r: Rendered) => {
  const x = p.center[0] - r.pose.c[0];
  const y = p.center[1] - r.pose.c[1];
  return { distance: Math.hypot(x, y), yawDeg: (Math.atan2(y, x) * 180) / Math.PI };
};

/** Pairs detections with pieces (greedy, best overlap first). A pair needs an IoU of at least {@link MATCH_IOU}. */
export const MATCH_IOU = 0.3;

/** For each detection, the index of the truth piece it found, or -1 for a false positive. */
export function matchDetections(dets: Box2[], truth: TruthPiece[]): number[] {
  const pairs: [number, number, number][] = [];
  dets.forEach((d, i) =>
    truth.forEach((t, j) => {
      const o = iou(d, t.box);
      if (o >= MATCH_IOU) pairs.push([o, i, j]);
    })
  );
  pairs.sort((a, b) => b[0] - a[0]);
  const match = new Array<number>(dets.length).fill(-1);
  const used = new Set<number>();
  for (const [, i, j] of pairs) {
    if (match[i] >= 0 || used.has(j)) continue;
    match[i] = j;
    used.add(j);
  }
  return match;
}

/** How the robot picks one target when several are found. */
export type TargetRule = "largest" | "lowest" | "center" | "confident";

/** Index of the chosen target among `dets`, or -1 if there are none. */
export function pickTarget(dets: { box: Box2; score: number }[], rule: TargetRule, K: Intrinsics): number {
  let best = -1;
  let bestKey = -Infinity;
  dets.forEach((d, i) => {
    const w = d.box.x1 - d.box.x0;
    const h = d.box.y1 - d.box.y0;
    const key =
      rule === "largest"
        ? w * h
        : rule === "lowest"
          ? d.box.y1
          : rule === "center"
            ? -Math.abs((d.box.x0 + d.box.x1) / 2 - K.cx)
            : d.score;
    if (key > bestKey) {
      bestKey = key;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rough processing times.

/** Where the network runs. */
export type Accelerator = "cpu" | "npu";

/**
 * Rough processing time (ms) for the color pipeline on a single-board computer's CPU. Scales with the number of
 * pixels. For comparing settings, not for planning.
 */
export const colorPipelineMs = (pixels: number) => 0.5 + pixels * 1e-5;

/**
 * Rough inference time (ms) for a small detector, with pre- and post-processing. Scales with the model input area.
 * About 100 ms at 320×320 on a CPU, about 8 ms with a neural accelerator. For comparing settings, not for planning.
 */
export const networkMs = (inputSize: number, hw: Accelerator) => (hw === "cpu" ? 95 : 6) * (inputSize / 320) ** 2 + 2;
