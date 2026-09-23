/**
 * Monte Carlo and sweep simulations behind the Vision widgets. Each builds a scene from {@link Tag}s, projects the
 * corners through a camera, optionally adds pixel noise or uses the wrong intrinsics, and solves the pose back with
 * {@link solvePnP}. Pure functions: no React.
 */

import {
  cameraLookingAlong,
  cameraYaw,
  DEFAULT_CAMERA,
  project,
  refinePose,
  rng,
  rotateCameraAboutZ,
  solvePnP,
  sub,
  tagCorners,
  toCamera,
  wrapAngle,
  type CameraPose,
  type Intrinsics,
  type Pixel,
  type Tag,
  type TagObservation,
  type Vec3,
} from "./vision";

const DEG = Math.PI / 180;

/** Height of the camera lens and of the tag centers used by the scenes (m). */
const CAMERA_HEIGHT = 0.4;
const TAG_HEIGHT = 0.5;

/** Which tags the camera sees in {@link poseScatter}. */
export type TagLayout = "single" | "pair" | "angled";

/**
 * Tags for a scene centered `distance` meters in front of a camera at the origin looking along +x.
 * `tagYawDeg` turns the whole group away from facing the camera head-on.
 */
export function sceneTags(layout: TagLayout, distance: number, tagYawDeg: number): Tag[] {
  const facing = Math.PI + tagYawDeg * DEG;
  const at = (yaw: number, offset: number): Tag => ({
    // Offset along the group's face, to the viewer's right.
    center: [distance - offset * Math.sin(facing), offset * Math.cos(facing), TAG_HEIGHT],
    yaw,
  });
  if (layout === "single") return [at(facing, 0)];
  if (layout === "pair") return [at(facing, -0.3), at(facing, 0.3)];
  // Two faces of a hexagonal structure: normals 60° apart, like adjacent sides of a hexagon.
  return [at(facing + 30 * DEG, -0.3), at(facing - 30 * DEG, 0.3)];
}

/** Projects every tag's corners. Returns `null` if any corner falls outside the image. */
export function observe(K: Intrinsics, cam: CameraPose, tags: Tag[]): TagObservation[] | null {
  const out: TagObservation[] = [];
  for (const tag of tags) {
    const pixels = tagCorners(tag).map((p) => project(K, cam, p));
    if (pixels.some((p) => !p || p[0] < 0 || p[0] > K.width || p[1] < 0 || p[1] > K.height)) return null;
    out.push({ tag, pixels: pixels as Pixel[] });
  }
  return out;
}

/** Inputs for {@link poseScatter}. */
export interface ScatterParams {
  layout: TagLayout;
  /** Distance from the camera to the center of the tag group (m). */
  distance: number;
  /** Rotation of the tag group away from facing the camera (degrees). */
  tagYawDeg: number;
  /** Standard deviation of the corner detection noise, per pixel coordinate (px). */
  noisePx: number;
  /** Take the camera's heading from the gyro and solve only its position. */
  gyroHeading?: boolean;
  trials: number;
  seed?: number;
  camera?: Intrinsics;
}

/** One solved pose, as the error from the true camera pose. */
export interface PoseSample {
  /** Error along the line of sight, toward the tags positive (m). */
  range: number;
  /** Error across the line of sight, to the left positive (m). */
  lateral: number;
  /** Heading error (radians). */
  yaw: number;
}

/** Result of {@link poseScatter}. */
export interface ScatterResult {
  /** False if the tags don't fit in the image, in which case `samples` is empty. */
  visible: boolean;
  samples: PoseSample[];
  /** Root-mean-square errors. */
  rmsRange: number;
  rmsLateral: number;
  rmsYaw: number;
  /** Width of the largest tag in the image (px). */
  tagWidthPx: number;
}

const rms = (xs: number[]) => (xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) : NaN);

/**
 * Solves the camera pose many times with random corner noise and returns the spread of the results. The camera sits
 * at the origin looking along +x, so range error is the x error and lateral error is the y error.
 */
export function poseScatter(params: ScatterParams): ScatterResult {
  const K = params.camera ?? DEFAULT_CAMERA;
  const cam = cameraLookingAlong([0, 0, CAMERA_HEIGHT], 0);
  const tags = sceneTags(params.layout, params.distance, params.tagYawDeg);
  const clean = observe(K, cam, tags);
  if (!clean) return { visible: false, samples: [], rmsRange: NaN, rmsLateral: NaN, rmsYaw: NaN, tagWidthPx: NaN };
  const tagWidthPx = Math.max(
    ...clean.map((o) => Math.hypot(o.pixels[1][0] - o.pixels[0][0], o.pixels[1][1] - o.pixels[0][1]))
  );

  const random = rng(params.seed ?? 2702);
  const samples: PoseSample[] = [];
  for (let i = 0; i < params.trials; i++) {
    const noisy = clean.map((o) => ({
      tag: o.tag,
      pixels: o.pixels.map((p): Pixel => [
        p[0] + random.normal() * params.noisePx,
        p[1] + random.normal() * params.noisePx,
      ]),
    }));
    const { pose } = solvePnP(K, noisy, params.gyroHeading ? cam.R : undefined);
    const d = sub(pose.c, cam.c);
    samples.push({ range: d[0], lateral: d[1], yaw: wrapAngle(cameraYaw(pose)) });
  }
  return {
    visible: true,
    samples,
    rmsRange: rms(samples.map((s) => s.range)),
    rmsLateral: rms(samples.map((s) => s.lateral)),
    rmsYaw: rms(samples.map((s) => s.yaw)),
    tagWidthPx,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Single-tag ambiguity.

/** Result of {@link planarAmbiguity}. */
export interface AmbiguityResult {
  /** The tag's corners in the image. */
  pixels: Pixel[] | null;
  /**
   * The other local minimum of the reprojection error: the camera pose that sees the tag turned the other way. `null`
   * when the solver slides back to the true pose, so there is no second solution to confuse it with.
   */
  alternate: { pose: CameraPose; pixels: Pixel[]; rmsError: number } | null;
}

/**
 * Looks for the second pose that explains one tag's corners almost as well as the true pose. Seen from the camera,
 * a tag turned by +θ from the line of sight looks nearly the same as one turned by -θ. Starting the solver from that
 * mirrored pose finds the second minimum, and its reprojection error shows how easily noise could pick it instead.
 */
export function planarAmbiguity(K: Intrinsics, cam: CameraPose, tag: Tag): AmbiguityResult {
  const obs = observe(K, cam, [tag]);
  if (!obs) return { pixels: null, alternate: null };
  const pixels = obs[0].pixels;
  // Angle of the tag's face relative to the line of sight, then the same angle on the other side.
  const sight = Math.atan2(cam.c[1] - tag.center[1], cam.c[0] - tag.center[0]);
  const relative = wrapAngle(tag.yaw - sight);
  // Seeing the tag turned by -relative is the same as the camera orbiting the tag by +2·relative.
  const start = rotateCameraAboutZ(cam, tag.center, 2 * relative);
  const solved = refinePose(K, tagCorners(tag), pixels, start, { iterations: 60 });
  const moved = Math.hypot(solved.pose.c[0] - cam.c[0], solved.pose.c[1] - cam.c[1]);
  if (moved < 0.01) return { pixels, alternate: null };
  const altPixels = tagCorners(tag).map((p) => project(K, solved.pose, p));
  if (altPixels.some((p) => !p)) return { pixels, alternate: null };
  return { pixels, alternate: { pose: solved.pose, pixels: altPixels as Pixel[], rmsError: solved.rmsError } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Relative vs. global positioning.

/** Inputs for {@link relativeVsGlobal}. */
export interface RelativeGlobalParams {
  /** Distance from the camera to the target tag (m). */
  distance: number;
  /** How far the target tag (and the structure it is on) sits from its published position, sideways (m). */
  fieldShift: number;
  /** How far the target tag is turned from its published orientation (degrees). */
  fieldTwistDeg: number;
  /** Corner noise (px). */
  noisePx: number;
  trials: number;
  seed?: number;
}

/** Error of the estimated scoring point, in the robot's frame: range (forward) and lateral (left). */
export interface PointSample {
  range: number;
  lateral: number;
}

/** Result of {@link relativeVsGlobal}. */
export interface RelativeGlobalResult {
  visible: boolean;
  relative: PointSample[];
  global: PointSample[];
  /** Mean error (bias) and root-mean-square spread around the mean, per method (m). */
  relativeBias: number;
  relativeSpread: number;
  globalBias: number;
  globalSpread: number;
}

/** Scoring point in front of the target tag, in the tag's own frame: straight out from its face (m). */
const SCORING_OFFSET = 0.5;

const meanAndSpread = (xs: PointSample[]) => {
  const mr = xs.reduce((s, x) => s + x.range, 0) / xs.length;
  const ml = xs.reduce((s, x) => s + x.lateral, 0) / xs.length;
  const spread = Math.sqrt(xs.reduce((s, x) => s + (x.range - mr) ** 2 + (x.lateral - ml) ** 2, 0) / xs.length);
  return { bias: Math.hypot(mr, ml), spread };
};

/** Point `SCORING_OFFSET` meters straight out from a tag's face. */
const scoringPoint = (tag: Tag): Vec3 => [
  tag.center[0] + SCORING_OFFSET * Math.cos(tag.yaw),
  tag.center[1] + SCORING_OFFSET * Math.sin(tag.yaw),
  tag.center[2],
];

/** The scene behind {@link relativeVsGlobal}, in world coordinates with the camera at the origin looking along +x. */
export interface RelativeGlobalScene {
  camera: CameraPose;
  /** Where the field layout says the target tag is. */
  layoutTarget: Tag;
  /** Where the target tag really is: shifted sideways along its face and twisted. */
  realTarget: Tag;
  /** A second, correctly placed tag. */
  other: Tag;
  /** The scoring point in front of the real target tag, and where the layout says it is. */
  trueScoring: Vec3;
  layoutScoring: Vec3;
}

/** Builds the scene for {@link relativeVsGlobal}. */
export function relativeGlobalScene(distance: number, fieldShift: number, fieldTwistDeg: number): RelativeGlobalScene {
  // Target tag straight ahead, a second tag 0.8 m to its left on a face turned 30° toward the camera.
  const layoutTarget: Tag = { center: [distance, 0, TAG_HEIGHT], yaw: Math.PI };
  const realTarget: Tag = { center: [distance, fieldShift, TAG_HEIGHT], yaw: Math.PI + fieldTwistDeg * DEG };
  return {
    camera: cameraLookingAlong([0, 0, CAMERA_HEIGHT], 0),
    layoutTarget,
    realTarget,
    other: { center: [distance - 0.2, 0.8, TAG_HEIGHT], yaw: Math.PI + 30 * DEG },
    trueScoring: scoringPoint(realTarget),
    layoutScoring: scoringPoint(layoutTarget),
  };
}

/**
 * Compares two ways to find a scoring point next to a target tag, when the target tag is not exactly where the field
 * layout says it is:
 *
 * - **Relative**: solve against the target tag alone and place the scoring point relative to it. The layout error
 *   cancels, because the camera measures the tag where it really is.
 * - **Global**: solve against the target tag and a second, correctly placed tag using the field layout, with the
 *   heading from the gyro, then look up the scoring point in field coordinates. More points and a known heading
 *   reduce noise, but the layout error biases the result.
 */
export function relativeVsGlobal(params: RelativeGlobalParams): RelativeGlobalResult {
  const K = DEFAULT_CAMERA;
  const scene = relativeGlobalScene(params.distance, params.fieldShift, params.fieldTwistDeg);
  const { camera: cam, layoutTarget, realTarget, other } = scene;
  const clean = observe(K, cam, [realTarget, other]);
  const empty = { relativeBias: NaN, relativeSpread: NaN, globalBias: NaN, globalSpread: NaN };
  if (!clean) return { visible: false, relative: [], global: [], ...empty };

  // Error of an estimate of the scoring point in the camera frame: range forward (camera z), lateral left (-x).
  const truth = toCamera(cam, scene.trueScoring);
  const toRobot = (estimated: CameraPose, point: Vec3): PointSample => {
    const p = toCamera(estimated, point);
    return { range: p[2] - truth[2], lateral: truth[0] - p[0] };
  };

  const random = rng(params.seed ?? 2702);
  const relative: PointSample[] = [];
  const global: PointSample[] = [];
  for (let i = 0; i < params.trials; i++) {
    const noisy = clean.map((o) => ({
      tag: o.tag,
      pixels: o.pixels.map((p): Pixel => [
        p[0] + random.normal() * params.noisePx,
        p[1] + random.normal() * params.noisePx,
      ]),
    }));
    // Relative: the solver only knows the target tag, at its layout pose. The scoring point is defined from that pose.
    const rel = solvePnP(K, [{ tag: layoutTarget, pixels: noisy[0].pixels }]);
    relative.push(toRobot(rel.pose, scoringPoint(layoutTarget)));
    // Global: both tags at their layout poses, heading from the gyro (as a pose estimator trusts it), scoring point
    // from the layout.
    const glob = solvePnP(
      K,
      [
        { tag: layoutTarget, pixels: noisy[0].pixels },
        { tag: other, pixels: noisy[1].pixels },
      ],
      cam.R
    );
    global.push(toRobot(glob.pose, scoringPoint(layoutTarget)));
  }
  const r = meanAndSpread(relative);
  const g = meanAndSpread(global);
  return {
    visible: true,
    relative,
    global,
    relativeBias: r.bias,
    relativeSpread: r.spread,
    globalBias: g.bias,
    globalSpread: g.spread,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Calibration errors.

/** Inputs for {@link calibrationSweep}. */
export interface CalibrationParams {
  /** Error in the focal length the solver assumes, as a fraction (0.03 = 3% too long). */
  focalError: number;
  /** Error in the assumed principal point, horizontal (px). */
  principalOffsetPx: number;
  /** Radial distortion the real lens has, which the solver ignores. */
  trueK1: number;
  /** Bearing of the tag from the optical axis (degrees). 0 puts it in the image center. */
  bearingDeg: number;
  /** Distances to evaluate (m). */
  distances: number[];
}

/**
 * One point of {@link calibrationSweep}: the error in where the solver places the tag relative to the camera, with no
 * noise at all, only the wrong intrinsics. With the heading from the gyro, this is the robot's position error.
 */
export interface CalibrationPoint {
  distance: number;
  /** Error in distance to the tag (m). */
  range: number;
  /** Error across the line of sight, to the left positive (m). */
  lateral: number;
  /** Error in the tag's solved orientation (radians). A single-tag solve turns this into position error. */
  tagYaw: number;
  /** Reprojection error the solver reports (px). Low values don't prove the calibration is right. */
  rmsError: number;
  /** Error in the robot's position with the heading from the gyro (only position solved). */
  gyro: RobotError;
  /** Error in the robot's position with the heading solved from the tag too. */
  solved: RobotError;
}

/**
 * Error in the robot's estimated position, split along and across the line between the robot and the tag. The camera
 * sits at the robot's center.
 */
export interface RobotError {
  /** Along the line (m): positive puts the robot farther from the tag than it is. */
  along: number;
  /** Across the line (m): positive puts the robot to its own left, as seen while facing the tag. */
  across: number;
  /** Error in the robot's heading (radians, counterclockwise positive). Zero when the heading comes from the gyro. */
  heading: number;
}

/**
 * Pose error from calibration mistakes alone: corners are projected with the real lens (`trueK1`, nominal focal
 * length and principal point) and solved with the intrinsics the robot thinks it has. No noise is added.
 */
export function calibrationSweep(params: CalibrationParams): (CalibrationPoint | null)[] {
  const real: Intrinsics = { ...DEFAULT_CAMERA, k1: params.trueK1 };
  const assumed: Intrinsics = {
    ...DEFAULT_CAMERA,
    fx: DEFAULT_CAMERA.fx * (1 + params.focalError),
    fy: DEFAULT_CAMERA.fy * (1 + params.focalError),
    cx: DEFAULT_CAMERA.cx + params.principalOffsetPx,
    k1: 0,
  };
  const bearing = params.bearingDeg * DEG;
  const cam = cameraLookingAlong([0, 0, TAG_HEIGHT], 0);
  return params.distances.map((distance) => {
    // Tag facing the camera, at the given bearing (to the left for positive bearing).
    const tag: Tag = {
      center: [distance * Math.cos(bearing), distance * Math.sin(bearing), TAG_HEIGHT],
      yaw: Math.PI + bearing,
    };
    const obs = observe(real, cam, [tag]);
    if (!obs) return null;
    const { pose, rmsError } = solvePnP(assumed, obs);
    // The tag center in camera coordinates, split along and across the line of sight.
    const t = toCamera(pose, tag.center);
    const trueT = toCamera(cam, tag.center);
    const est = Math.hypot(t[0], t[2]);
    const truth = Math.hypot(trueT[0], trueT[2]);
    const bearingEst = Math.atan2(-t[0], t[2]);
    // The tag's normal seen from the camera: rotate the world normal into camera coordinates.
    const normal = toCamera({ R: pose.R, c: [0, 0, 0] }, [Math.cos(tag.yaw), Math.sin(tag.yaw), 0]);
    const trueNormal = toCamera({ R: cam.R, c: [0, 0, 0] }, [Math.cos(tag.yaw), Math.sin(tag.yaw), 0]);
    // Where the robot ends up. With the gyro, only the tag's position in camera coordinates is used, and the camera is
    // placed back from the tag with the true rotation. Solved from the tag, the camera pose comes straight from PnP.
    const back = [0, 1, 2].map((i) => cam.R.reduce((sum, row, j) => sum + row[i] * t[j], 0));
    const gyroCam: Vec3 = [tag.center[0] - back[0], tag.center[1] - back[1], tag.center[2] - back[2]];
    const split = (c: Vec3, heading: number): RobotError => {
      const e = sub(c, cam.c);
      return {
        along: -(e[0] * Math.cos(bearing) + e[1] * Math.sin(bearing)),
        across: -e[0] * Math.sin(bearing) + e[1] * Math.cos(bearing),
        heading,
      };
    };
    return {
      distance,
      gyro: split(gyroCam, 0),
      solved: split(pose.c, wrapAngle(cameraYaw(pose) - cameraYaw(cam))),
      range: est - truth,
      lateral: truth * wrapAngle(bearingEst - bearing),
      tagYaw: wrapAngle(Math.atan2(normal[0], normal[2]) - Math.atan2(trueNormal[0], trueNormal[2])),
      rmsError,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Rolling shutter.

/** Inputs for {@link rollingShutter}. */
export interface ShutterParams {
  /** Distance from the camera to the tag, straight ahead (m). */
  distance: number;
  /** Robot turn rate (degrees per second, counterclockwise positive). */
  turnRateDegS: number;
  /** Robot speed to its left, across the line of sight (m/s). */
  lateralSpeed: number;
  /** Time to read the whole frame, top row to bottom row (s). Zero is a global shutter. */
  readout: number;
  /** Exposure time of each row (s). */
  exposure: number;
}

/** Result of {@link rollingShutter}. Errors are for the robot, split as in {@link RobotError}. */
export interface ShutterResult {
  /** Camera pose at the moment the tag's center row is read: the reference for all errors. */
  camera: CameraPose;
  /**
   * Projects a world point the way the shutter captures it: each row at its own moment. `offset` (s) shifts the whole
   * readout in time, for drawing the motion blur of one exposure.
   */
  capture: (p: Vec3, offset?: number) => Pixel | null;
  /** Tag corners as captured, and as a global shutter would capture them at the reference moment. */
  pixels: Pixel[];
  globalPixels: Pixel[];
  /** Time between reading the tag's top and bottom rows (s). */
  tagReadTime: number;
  /** How far the tag's top edge is shifted sideways relative to its bottom edge, beyond a global shutter (px). */
  skewPx: number;
  /** Length of the motion blur streak during one exposure, at the tag's center (px). */
  blurPx: number;
  /** Heading solved from the tag, error timestamped at the tag's center row. */
  solved: RobotError;
  /** Heading from the gyro, error timestamped at the tag's center row. */
  gyro: RobotError;
  /** Time from the start of the frame to the tag's center row (s): the error if the frame start is used as the timestamp. */
  frameStartOffset: number;
  /** Heading from the gyro, but the measurement timestamped at the start of the frame. */
  gyroFrameStart: RobotError;
  /** Reprojection error of the solve with the heading solved (px). */
  rmsError: number;
}

/**
 * A tag seen by a camera on a moving robot. A rolling shutter reads the rows one after another, so each row sees the
 * robot at a slightly different moment and the tag is sheared. Solves the pose from the captured corners and compares
 * it with the true pose. No noise and no calibration error: every error here comes from motion during the readout.
 */
export function rollingShutter(params: ShutterParams): ShutterResult | null {
  const K = DEFAULT_CAMERA;
  const omega = params.turnRateDegS * DEG;
  const tag: Tag = { center: [params.distance, 0, TAG_HEIGHT], yaw: Math.PI };
  // The robot's camera at time t, with t = 0 when the tag's center row is read.
  const poseAt = (t: number) => cameraLookingAlong([0, params.lateralSpeed * t, CAMERA_HEIGHT], omega * t);
  const camera = poseAt(0);
  const center = project(K, camera, tag.center);
  if (!center) return null;
  const rowTime = (v: number) => (params.readout * (v - center[1])) / K.height;
  const capture = (p: Vec3, offset = 0): Pixel | null => {
    // The row a point lands on depends on when it is read, and the moment depends on the row: iterate to agree.
    let t = 0;
    let q: Pixel | null = null;
    for (let i = 0; i < 6; i++) {
      q = project(K, poseAt(t + offset), p);
      if (!q) return null;
      t = rowTime(q[1]);
    }
    return q;
  };
  const corners = tagCorners(tag);
  const pixels = corners.map((p) => capture(p));
  const globalPixels = corners.map((p) => project(K, camera, p));
  if ([...pixels, ...globalPixels].some((q) => !q || q[0] < 0 || q[0] > K.width || q[1] < 0 || q[1] > K.height))
    return null;
  const px = pixels as Pixel[];
  const gpx = globalPixels as Pixel[];
  const obs: TagObservation[] = [{ tag, pixels: px }];

  // Corners: bottom-left, bottom-right, top-right, top-left.
  const shift = (i: number) => px[i][0] - gpx[i][0];
  const skewPx = (shift(2) + shift(3)) / 2 - (shift(0) + shift(1)) / 2;
  const tagReadTime = rowTime(Math.max(px[0][1], px[1][1])) - rowTime(Math.min(px[2][1], px[3][1]));
  const half = params.exposure / 2;
  const a = project(K, poseAt(-half), tag.center);
  const b = project(K, poseAt(half), tag.center);
  const blurPx = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : NaN;

  const split = (c: Vec3, truth: Vec3, heading: number): RobotError => ({
    along: -(c[0] - truth[0]),
    across: c[1] - truth[1],
    heading,
  });
  const solvedSol = solvePnP(K, obs);
  const gyroSol = solvePnP(K, obs, camera.R);
  const frameStartOffset = (params.readout * center[1]) / K.height;
  const early = poseAt(-frameStartOffset);
  const lateSol = solvePnP(K, obs, early.R);
  return {
    camera,
    capture,
    pixels: px,
    globalPixels: gpx,
    tagReadTime,
    skewPx,
    blurPx,
    solved: split(solvedSol.pose.c, camera.c, wrapAngle(cameraYaw(solvedSol.pose) - cameraYaw(camera))),
    gyro: split(gyroSol.pose.c, camera.c, 0),
    frameStartOffset,
    gyroFrameStart: split(lateSol.pose.c, early.c, 0),
    rmsError: solvedSol.rmsError,
  };
}
