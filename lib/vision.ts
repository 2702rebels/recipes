/**
 * Camera geometry and pose solving for the Vision pages: pinhole projection with radial distortion, homography-based
 * pose initialization for a single tag, and iterative (Levenberg-Marquardt) refinement of the reprojection error over
 * any number of tag corners. Pure functions with no React or DOM dependencies.
 *
 * Frames:
 * - World (field) frame uses WPILib axes: x forward, y left, z up. Meters and radians.
 * - Camera frame uses the OpenCV convention: x right, y down, z forward along the optical axis.
 */

/** 3-vector. */
export type Vec3 = [number, number, number];

/** 3×3 matrix, row-major. */
export type Mat3 = [Vec3, Vec3, Vec3];

/** Image coordinates in pixels: `[u, v]`, u to the right and v down from the top-left corner. */
export type Pixel = [number, number];

/** Side of the black square of an FRC AprilTag (6.5 in), in meters. */
export const TAG_SIZE = 0.1651;

/** Pinhole camera intrinsics with a two-term radial distortion model. */
export interface Intrinsics {
  /** Focal length in pixels, horizontal. */
  fx: number;
  /** Focal length in pixels, vertical. */
  fy: number;
  /** Principal point (where the optical axis hits the sensor), in pixels. */
  cx: number;
  cy: number;
  /** Radial distortion coefficients (Brown-Conrady). Negative k1 is barrel distortion. */
  k1: number;
  k2: number;
  /** Image size in pixels. */
  width: number;
  height: number;
}

/** Focal length in pixels for a horizontal field of view (degrees) across `width` pixels. */
export const focalFromFov = (hfovDeg: number, width: number) => width / 2 / Math.tan((hfovDeg * Math.PI) / 360);

/** A 1280×800 camera with a 70° horizontal field of view and no distortion. The worked examples use this camera. */
export const DEFAULT_CAMERA: Intrinsics = {
  fx: focalFromFov(70, 1280),
  fy: focalFromFov(70, 1280),
  cx: 640,
  cy: 400,
  k1: 0,
  k2: 0,
  width: 1280,
  height: 800,
};

/** Camera pose in the world frame. */
export interface CameraPose {
  /** Rotation from world to camera coordinates. Its rows are the camera's x, y, z axes expressed in the world. */
  R: Mat3;
  /** Camera center in the world frame. */
  c: Vec3;
}

/** A vertical tag in the world frame. */
export interface Tag {
  /** Center of the tag. */
  center: Vec3;
  /** Direction the printed face points, measured counterclockwise from +x (radians). */
  yaw: number;
  /** Side of the black square (m). Defaults to {@link TAG_SIZE}. */
  size?: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Small vector and matrix helpers.

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3) => Math.sqrt(dot(a, a));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const mulMV = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};
const det = (m: Mat3) => dot(m[0], cross(m[1], m[2]));

/** Solves `A x = b` by Gaussian elimination with partial pivoting. `A` is square. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-15) continue;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = Math.abs(M[r][r]) < 1e-15 ? 0 : s / M[r][r];
  }
  return x;
}

/** Rotation matrix for a rotation vector `w` (axis times angle), by the Rodrigues formula. */
export function expSO3(w: Vec3): Mat3 {
  const theta = norm(w);
  const I: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  if (theta < 1e-12) return I;
  const [x, y, z] = scale(w, 1 / theta);
  const s = Math.sin(theta);
  const c = 1 - Math.cos(theta);
  return [
    [1 - c * (y * y + z * z), -s * z + c * x * y, s * y + c * x * z],
    [s * z + c * x * y, 1 - c * (x * x + z * z), -s * x + c * y * z],
    [-s * y + c * x * z, s * x + c * y * z, 1 - c * (x * x + y * y)],
  ];
}

/** Closest rotation to a nearly orthonormal matrix, by iterating the polar decomposition. */
function nearestRotation(m: Mat3): Mat3 {
  let x = m;
  for (let i = 0; i < 20; i++) {
    const d = det(x);
    // Inverse transpose from cofactors: inv(X)^T = cofactor(X) / det(X).
    const cof: Mat3 = [cross(x[1], x[2]), cross(x[2], x[0]), cross(x[0], x[1])];
    const next = x.map((row, r) => row.map((v, c) => (v + cof[r][c] / d) / 2)) as Mat3;
    const change = next.flat().reduce((s, v, k) => s + Math.abs(v - x.flat()[k]), 0);
    x = next;
    if (change < 1e-12) break;
  }
  return x;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scene construction and projection.

/** Camera at `position` looking along heading `yaw` (radians, CCW from +x), tilted up by `pitch`. */
export function cameraLookingAlong(position: Vec3, yaw: number, pitch = 0): CameraPose {
  const f: Vec3 = [Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)];
  const left: Vec3 = [-Math.sin(yaw), Math.cos(yaw), 0];
  const up = cross(f, left);
  return { R: [scale(left, -1), scale(up, -1), f], c: position };
}

/** Where a world point is in camera coordinates (x right, y down, z forward). */
export const toCamera = (pose: CameraPose, p: Vec3): Vec3 => mulMV(pose.R, sub(p, pose.c));

/** Rotates a camera pose about the vertical axis through `pivot` by `angle` (radians, CCW seen from above). */
export function rotateCameraAboutZ(pose: CameraPose, pivot: Vec3, angle: number): CameraPose {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const Rz: Mat3 = [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
  return { R: mulMM(pose.R, transpose(Rz)), c: add(pivot, mulMV(Rz, sub(pose.c, pivot))) };
}

/** Heading of the camera's optical axis in the world (radians, CCW from +x). */
export const cameraYaw = (pose: CameraPose) => Math.atan2(pose.R[2][1], pose.R[2][0]);

/** Point on a tag's face at `(a, b)` meters from its center: `a` to the viewer's right, `b` up. */
export function tagPoint(tag: Tag, a: number, b: number): Vec3 {
  const right: Vec3 = [-Math.sin(tag.yaw), Math.cos(tag.yaw), 0];
  return [tag.center[0] + a * right[0], tag.center[1] + a * right[1], tag.center[2] + b];
}

/** The four corners of a tag's black square: bottom-left, bottom-right, top-right, top-left, as seen facing it. */
export function tagCorners(tag: Tag): Vec3[] {
  const h = (tag.size ?? TAG_SIZE) / 2;
  return [tagPoint(tag, -h, -h), tagPoint(tag, h, -h), tagPoint(tag, h, h), tagPoint(tag, -h, h)];
}

/**
 * Data bits drawn inside the illustrative tag, row by row from the top, 1 = black. Made up for the diagrams: it is not
 * a real 36h11 code, so a detector will not decode it.
 */
export const TAG_PATTERN = [
  [1, 0, 1, 1, 0, 0],
  [0, 0, 1, 0, 1, 1],
  [1, 1, 0, 0, 0, 1],
  [0, 1, 0, 1, 1, 0],
  [1, 0, 0, 1, 0, 1],
  [0, 1, 1, 0, 1, 1],
];

/** Applies the radial distortion model to normalized image coordinates. */
export const distort = (K: Intrinsics, x: number, y: number): [number, number] => {
  const r2 = x * x + y * y;
  const d = 1 + K.k1 * r2 + K.k2 * r2 * r2;
  return [x * d, y * d];
};

/** Projects a world point into the image. Returns `null` for points behind (or almost at) the camera. */
export function project(K: Intrinsics, cam: CameraPose, p: Vec3): Pixel | null {
  const pc = mulMV(cam.R, sub(p, cam.c));
  if (pc[2] < 0.01) return null;
  const [x, y] = distort(K, pc[0] / pc[2], pc[1] / pc[2]);
  return [K.fx * x + K.cx, K.fy * y + K.cy];
}

/** Converts a pixel to undistorted normalized image coordinates (a ray direction `[x, y, 1]` in the camera frame). */
export function normalize(K: Intrinsics, px: Pixel): [number, number] {
  const xd = (px[0] - K.cx) / K.fx;
  const yd = (px[1] - K.cy) / K.fy;
  let x = xd;
  let y = yd;
  for (let i = 0; i < 20; i++) {
    const r2 = x * x + y * y;
    const d = 1 + K.k1 * r2 + K.k2 * r2 * r2;
    x = xd / d;
    y = yd / d;
  }
  return [x, y];
}

// ---------------------------------------------------------------------------------------------------------------------
// Pose solving.

/**
 * Homography `H` (with `H[2][2] = 1`) mapping planar points `src` to image points `dst`, by the direct linear
 * transform. Needs at least four points, no three of them on a line.
 */
export function homography(src: [number, number][], dst: [number, number][]): Mat3 {
  const rows: number[][] = [];
  const rhs: number[] = [];
  src.forEach(([a, b], i) => {
    const [x, y] = dst[i];
    rows.push([a, b, 1, 0, 0, 0, -x * a, -x * b]);
    rhs.push(x);
    rows.push([0, 0, 0, a, b, 1, -y * a, -y * b]);
    rhs.push(y);
  });
  // Least squares through the normal equations. Exact for four points.
  const AtA = Array.from({ length: 8 }, (_, i) =>
    Array.from({ length: 8 }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0))
  );
  const Atb = Array.from({ length: 8 }, (_, i) => rows.reduce((s, r, k) => s + r[i] * rhs[k], 0));
  const h = solveLinear(AtA, Atb);
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

/**
 * Camera pose from one tag's four corners, by decomposing the tag-to-image homography. The tag plane maps to the
 * image as `H ∝ [r1 r2 t]`, so the first two columns give two rotation axes and the third gives the translation.
 */
export function poseFromTag(K: Intrinsics, tag: Tag, pixels: Pixel[]): CameraPose {
  const h = (tag.size ?? TAG_SIZE) / 2;
  const planar: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const H = homography(
    planar,
    pixels.map((p) => normalize(K, p))
  );
  const h1: Vec3 = [H[0][0], H[1][0], H[2][0]];
  const h2: Vec3 = [H[0][1], H[1][1], H[2][1]];
  const h3: Vec3 = [H[0][2], H[1][2], H[2][2]];
  let lambda = 2 / (norm(h1) + norm(h2));
  if (h3[2] < 0) lambda = -lambda; // The tag must be in front of the camera.
  const r1 = scale(h1, lambda);
  const r2 = scale(h2, lambda);
  // Q holds the tag's right, up, and normal axes expressed in camera coordinates.
  const q = nearestRotation(transpose([r1, r2, cross(r1, r2)]));
  // The same three axes in the world frame.
  const right: Vec3 = [-Math.sin(tag.yaw), Math.cos(tag.yaw), 0];
  const up: Vec3 = [0, 0, 1];
  const E = transpose([right, up, cross(right, up)]);
  const R = mulMM(q, transpose(E));
  const t = scale(h3, lambda); // Tag center in camera coordinates.
  const c = sub(tag.center, mulMV(transpose(R), t));
  return { R, c };
}

/** Result of {@link refinePose}. */
export interface PoseSolution {
  pose: CameraPose;
  /** Root-mean-square distance between observed and reprojected corners (px). */
  rmsError: number;
}

const residuals = (K: Intrinsics, pose: CameraPose, points: Vec3[], pixels: Pixel[]): number[] => {
  const out: number[] = [];
  points.forEach((p, i) => {
    const q = project(K, pose, p) ?? [1e6, 1e6];
    out.push(q[0] - pixels[i][0], q[1] - pixels[i][1]);
  });
  return out;
};

/** Applies a step: rotation vector then position (6 values), or position only (3 values) when rotation is fixed. */
const perturb = (pose: CameraPose, d: number[]): CameraPose =>
  d.length === 3
    ? { R: pose.R, c: add(pose.c, [d[0], d[1], d[2]]) }
    : { R: mulMM(expSO3([d[0], d[1], d[2]]), pose.R), c: add(pose.c, [d[3], d[4], d[5]]) };

const sumSq = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

/**
 * Refines a camera pose by minimizing the reprojection error with Levenberg-Marquardt. `points` are 3D world points
 * and `pixels` their observed image positions. The Jacobian is taken numerically. With `fixedRotation`, only the
 * position is solved and the rotation of `init` is kept, as when the heading comes from a gyro.
 */
export function refinePose(
  K: Intrinsics,
  points: Vec3[],
  pixels: Pixel[],
  init: CameraPose,
  { fixedRotation = false, iterations = 30 }: { fixedRotation?: boolean; iterations?: number } = {}
): PoseSolution {
  const dims = fixedRotation ? 3 : 6;
  let pose = init;
  let r = residuals(K, pose, points, pixels);
  let cost = sumSq(r);
  let lambda = 1e-3;
  const eps = 1e-6;
  for (let it = 0; it < iterations; it++) {
    const J = Array.from({ length: dims }, (_, k) => {
      const d = new Array<number>(dims).fill(0);
      d[k] = eps;
      const plus = residuals(K, perturb(pose, d), points, pixels);
      d[k] = -eps;
      const minus = residuals(K, perturb(pose, d), points, pixels);
      return plus.map((v, i) => (v - minus[i]) / (2 * eps));
    });
    const JtJ = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    const Jtr = J.map((a) => a.reduce((s, v, i) => s + v * r[i], 0));
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const step = solveLinear(
        A,
        Jtr.map((v) => -v)
      );
      const candidate = perturb(pose, step);
      const rc = residuals(K, candidate, points, pixels);
      const cc = sumSq(rc);
      if (cc < cost) {
        pose = candidate;
        r = rc;
        const gain = cost - cc;
        cost = cc;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = gain > 1e-14;
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  return { pose, rmsError: Math.sqrt(cost / points.length) };
}

/** Observed corners of one tag, in the order returned by {@link tagCorners}. */
export interface TagObservation {
  tag: Tag;
  pixels: Pixel[];
}

/**
 * Solves the camera pose from any number of tags: initializes from the tag that looks largest in the image, then
 * refines over every corner of every tag at once. This is the multi-tag approach: one solve over all known points.
 * Pass `rotation` to keep the camera's orientation fixed (known from the gyro and the mount) and solve position only.
 */
export function solvePnP(K: Intrinsics, observations: TagObservation[], rotation?: Mat3): PoseSolution {
  const area = (px: Pixel[]) =>
    Math.abs(px.reduce((s, p, i) => s + p[0] * px[(i + 1) % 4][1] - px[(i + 1) % 4][0] * p[1], 0)) / 2;
  const seed = observations.reduce((best, o) => (area(o.pixels) > area(best.pixels) ? o : best));
  let init = poseFromTag(K, seed.tag, seed.pixels);
  if (rotation) {
    // Keep the measured tag position in camera coordinates, and place the camera using the known rotation instead.
    const t = mulMV(init.R, sub(seed.tag.center, init.c));
    init = { R: rotation, c: sub(seed.tag.center, mulMV(transpose(rotation), t)) };
  }
  return refinePose(
    K,
    observations.flatMap((o) => tagCorners(o.tag)),
    observations.flatMap((o) => o.pixels),
    init,
    { fixedRotation: !!rotation }
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Random numbers, so simulations are repeatable.

/** Seeded random generator with uniform and Gaussian samples (mulberry32 + Box-Muller). */
export function rng(seed: number) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  return { uniform, normal };
}

/** Wraps an angle to (-π, π]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
