/**
 * Simulation of a robot driving laps with wheel odometry, with and without vision corrections. Behind the odometry
 * drift widget on the Localization page. Pure functions: no React.
 */

import { rng } from "./vision";

/** FRC field size (m), close to the 2026 field. */
export const FIELD_LENGTH = 16.54;
export const FIELD_WIDTH = 8.07;

/** An illustrative tag: position on the field and the direction its face points (radians). Not a real layout. */
export interface FieldTag {
  x: number;
  y: number;
  yaw: number;
}

/** Tags on the alliance walls and on two structures in the middle of the field. Illustrative, not a real layout. */
export const FIELD_TAGS: FieldTag[] = [
  { x: 0, y: 2.0, yaw: 0 },
  { x: 0, y: 6.0, yaw: 0 },
  { x: FIELD_LENGTH, y: 2.0, yaw: Math.PI },
  { x: FIELD_LENGTH, y: 6.0, yaw: Math.PI },
  { x: 4.6, y: FIELD_WIDTH / 2, yaw: 0 },
  { x: 4.6, y: FIELD_WIDTH / 2, yaw: Math.PI },
  { x: FIELD_LENGTH - 4.6, y: FIELD_WIDTH / 2, yaw: 0 },
  { x: FIELD_LENGTH - 4.6, y: FIELD_WIDTH / 2, yaw: Math.PI },
];

/** Inputs for {@link simulateOdometry}. */
export interface OdometryParams {
  /** Wheel diameter error as a fraction (0.02 = wheels 2% larger than the code thinks, from wear or tread). */
  wheelScaleError: number;
  /** Gyro heading drift (degrees per minute). */
  gyroDriftDegPerMin: number;
  /** Collisions per minute. Each makes the wheels slip, so odometry jumps by 0.2 to 1 m. */
  collisionsPerMin: number;
  /** Fuse vision measurements. */
  vision: boolean;
  /** Vision position noise with a tag 2 m away (m). Grows with the square of distance. */
  visionNoiseAt2m: number;
  /** Simulated time (s). */
  duration: number;
  seed?: number;
}

/** Result of {@link simulateOdometry}, sampled every {@link SAMPLE_DT}. */
export interface OdometryResult {
  t: number[];
  truth: [number, number][];
  odometry: [number, number][];
  fused: [number, number][];
  /** Position error of odometry alone and of odometry fused with vision (m). */
  odometryError: number[];
  fusedError: number[];
  /** Where each vision measurement put the robot. */
  measurements: [number, number][];
  /** Time and place of each collision. */
  collisions: [number, number][];
}

const DT = 0.02;
/** Output sample period (s). */
export const SAMPLE_DT = 0.1;
const CAMERA_HALF_FOV = (35 * Math.PI) / 180;
const MAX_TAG_RANGE = 5;
/** Largest angle between a tag's face and the camera at which it is still detected. */
const MAX_VIEW_ANGLE = (65 * Math.PI) / 180;
const VISION_PERIOD = 0.1;
/** Odometry error growth assumed by the filter: variance per meter traveled (m²/m). */
const ODOMETRY_VARIANCE_PER_METER = 0.03 ** 2;

/** A figure-eight lap across the field, about 12 s long at the chosen speed. */
function path(t: number): { x: number; y: number; heading: number } {
  const w = (2 * Math.PI) / 12;
  const x = FIELD_LENGTH / 2 + 6.2 * Math.sin(w * t);
  const y = FIELD_WIDTH / 2 + 2.6 * Math.sin(2 * w * t);
  const dx = 6.2 * w * Math.cos(w * t);
  const dy = 2.6 * 2 * w * Math.cos(2 * w * t);
  return { x, y, heading: Math.atan2(dy, dx) };
}

/** Distance to the nearest tag that the front or back camera can see, or `NaN` if none. */
function nearestVisibleTag(x: number, y: number, heading: number): number {
  let best = NaN;
  for (const tag of FIELD_TAGS) {
    const dx = tag.x - x;
    const dy = tag.y - y;
    const d = Math.hypot(dx, dy);
    if (d > MAX_TAG_RANGE || d < 0.3) continue;
    const bearing = Math.atan2(dy, dx) - heading;
    const offAxis = Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing)));
    if (offAxis > CAMERA_HALF_FOV && Math.PI - offAxis > CAMERA_HALF_FOV) continue;
    // The tag's face must point back toward the camera.
    const facing = Math.cos(tag.yaw) * -dx + Math.sin(tag.yaw) * -dy;
    if (facing / d < Math.cos(MAX_VIEW_ANGLE)) continue;
    if (!(d >= best)) best = d;
  }
  return best;
}

/**
 * Drives the figure-eight and tracks three positions: the truth, odometry alone (wheel scale error, gyro drift, and
 * slip during collisions), and odometry fused with vision by a simple Kalman filter. The robot has a camera facing
 * forward and one facing back. The filter trusts the gyro for
 * heading and weighs each vision measurement by its expected noise, as a pose estimator does.
 */
export function simulateOdometry(params: OdometryParams): OdometryResult {
  // Separate streams, so turning vision on doesn't change the odometry errors.
  const random = rng(params.seed ?? 2702);
  const visionRandom = rng((params.seed ?? 2702) + 1);
  const out: OdometryResult = {
    t: [],
    truth: [],
    odometry: [],
    fused: [],
    odometryError: [],
    fusedError: [],
    measurements: [],
    collisions: [],
  };
  const start = path(0);
  let odo: [number, number] = [start.x, start.y];
  let fused: [number, number] = [start.x, start.y];
  let variance = 0.01 ** 2;
  let prev = start;
  let nextVision = VISION_PERIOD;
  let nextSample = 0;
  const drift = (params.gyroDriftDegPerMin * Math.PI) / 180 / 60;
  const steps = Math.round(params.duration / DT);

  for (let i = 0; i <= steps; i++) {
    const t = i * DT;
    const now = path(t);
    if (i > 0) {
      // What the wheels report, rotated into the field by the (drifting) gyro heading.
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      const dist = Math.hypot(dx, dy);
      const headingError = drift * t;
      const s = 1 + params.wheelScaleError;
      const c = Math.cos(headingError);
      const sn = Math.sin(headingError);
      // Small random slip on every step: 1% of the distance traveled.
      const nx = random.normal() * 0.01 * dist;
      const ny = random.normal() * 0.01 * dist;
      const mx = s * (c * dx - sn * dy) + nx;
      const my = s * (sn * dx + c * dy) + ny;
      odo = [odo[0] + mx, odo[1] + my];
      fused = [fused[0] + mx, fused[1] + my];
      variance += ODOMETRY_VARIANCE_PER_METER * dist;

      // Collisions: the wheels slip, so odometry jumps and the filter doesn't know.
      if (random.uniform() < (params.collisionsPerMin / 60) * DT) {
        const angle = random.uniform() * 2 * Math.PI;
        const size = 0.2 + random.uniform() * 0.8;
        odo = [odo[0] + size * Math.cos(angle), odo[1] + size * Math.sin(angle)];
        fused = [fused[0] + size * Math.cos(angle), fused[1] + size * Math.sin(angle)];
        out.collisions.push([now.x, now.y]);
      }
    }

    if (params.vision && t >= nextVision) {
      nextVision += VISION_PERIOD;
      const d = nearestVisibleTag(now.x, now.y, now.heading);
      if (!Number.isNaN(d)) {
        const sigma = params.visionNoiseAt2m * (d / 2) ** 2;
        const z: [number, number] = [now.x + visionRandom.normal() * sigma, now.y + visionRandom.normal() * sigma];
        const gain = variance / (variance + sigma ** 2);
        fused = [fused[0] + gain * (z[0] - fused[0]), fused[1] + gain * (z[1] - fused[1])];
        variance *= 1 - gain;
        out.measurements.push(z);
      }
    }

    if (t >= nextSample - 1e-9) {
      nextSample += SAMPLE_DT;
      out.t.push(t);
      out.truth.push([now.x, now.y]);
      out.odometry.push(odo);
      out.fused.push(params.vision ? fused : odo);
      out.odometryError.push(Math.hypot(odo[0] - now.x, odo[1] - now.y));
      out.fusedError.push(params.vision ? Math.hypot(fused[0] - now.x, fused[1] - now.y) : NaN);
    }
    prev = now;
  }
  return out;
}
