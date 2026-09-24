/**
 * Simulations behind the Localization pages: odometry integration methods, a one-dimensional Kalman filter, WPILib's
 * constant-gain pose estimator, and a factor-graph smoother with robust kernels. Pure functions: no React.
 */

import { rng } from "./vision";

// ---------------------------------------------------------------------------------------------------------------
// Odometry integration
// ---------------------------------------------------------------------------------------------------------------

/** How odometry turns one loop's robot-relative movement into a field-relative one. */
export type IntegrationMethod = "euler" | "exp";

/**
 * How the robot moves. `spin`: a swerve drive crosses the field in a straight line while spinning. `arc`: the robot
 * drives a circle at constant speed and turn rate, like a tank drive turning.
 */
export type IntegrationMotion = "spin" | "arc";

/** Inputs for {@link simulateIntegration}. */
export interface IntegrationParams {
  motion: IntegrationMotion;
  /** Driving speed (m/s). */
  speed: number;
  /** How fast the robot turns (rad/s). */
  spinRate: number;
  /** Odometry update rate (Hz). */
  rateHz: number;
  /** Distance to drive (m). */
  distance: number;
}

/** Result of {@link simulateIntegration}, sampled about 200 times along the drive. */
export interface IntegrationResult {
  /** Time at each sample (s). */
  t: number[];
  /** Distance driven at each sample (m). */
  distance: number[];
  /** True pose at each sample: x, y (m), heading (rad). Every method has the same heading, from the perfect gyro. */
  truth: [number, number, number][];
  /** Position each method reports at each sample (m). */
  position: Record<IntegrationMethod, [number, number][]>;
  /** Position error of each method at each sample (m). */
  error: Record<IntegrationMethod, number[]>;
}

/** Rotates `(x, y)` by `a` radians. */
const rotate = (x: number, y: number, a: number): [number, number] => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
];

/**
 * Applies one odometry step: a robot-relative movement `(dx, dy)` with heading change `dtheta`, starting at heading
 * `theta`. Returns the field-relative movement.
 */
export function integrateStep(
  method: IntegrationMethod,
  theta: number,
  dx: number,
  dy: number,
  dtheta: number
): [number, number] {
  if (method === "euler") return rotate(dx, dy, theta);
  // Pose exponential, as in WPILib's Pose2d.exp: the robot moved along an arc of constant curvature.
  let s = 1 - (dtheta * dtheta) / 6;
  let c = dtheta / 2;
  if (Math.abs(dtheta) > 1e-9) {
    s = Math.sin(dtheta) / dtheta;
    c = (1 - Math.cos(dtheta)) / dtheta;
  }
  return rotate(dx * s - dy * c, dx * c + dy * s, theta);
}

/**
 * Drives the chosen motion and integrates exact robot-relative movements (perfect encoders and gyro) with each method.
 * The only error left comes from the integration method and the update rate.
 */
export function simulateIntegration(params: IntegrationParams): IntegrationResult {
  const { motion, speed, spinRate, rateHz, distance } = params;
  const dt = 1 / rateHz;
  const steps = Math.ceil(distance / speed / dt);
  const methods: IntegrationMethod[] = ["euler", "exp"];
  const pos: Record<IntegrationMethod, [number, number]> = { euler: [0, 0], exp: [0, 0] };
  const out: IntegrationResult = {
    t: [0],
    distance: [0],
    truth: [[0, 0, 0]],
    position: { euler: [[0, 0]], exp: [[0, 0]] },
    error: { euler: [0], exp: [0] },
  };
  const every = Math.max(1, Math.round(steps / 200));
  const phi = spinRate * dt;
  // What the wheels report over one step, for a robot that starts the step at heading 0. For `spin`, this is the
  // robot-relative velocity R(-θ(t)) v added up while the robot turns. For `arc`, the robot-relative velocity is
  // constant.
  const [bx, by] =
    motion === "arc" || Math.abs(phi) < 1e-9
      ? [speed * dt, 0]
      : [(speed * Math.sin(phi)) / spinRate, (speed * (Math.cos(phi) - 1)) / spinRate];
  for (let i = 1; i <= steps; i++) {
    const theta = spinRate * (i - 1) * dt;
    // The spinning robot drives a fixed field direction, so its robot-relative movement turns against its heading.
    const [dx, dy] = motion === "spin" ? rotate(bx, by, -theta) : [bx, by];
    for (const m of methods) {
      const [fx, fy] = integrateStep(m, theta, dx, dy, phi);
      pos[m] = [pos[m][0] + fx, pos[m][1] + fy];
    }
    if (i % every === 0 || i === steps) {
      const t = i * dt;
      const truth: [number, number] =
        motion === "spin" || Math.abs(spinRate) < 1e-9
          ? [speed * t, 0]
          : [(speed / spinRate) * Math.sin(spinRate * t), (speed / spinRate) * (1 - Math.cos(spinRate * t))];
      out.t.push(t);
      out.distance.push(speed * t);
      out.truth.push([truth[0], truth[1], spinRate * t]);
      for (const m of methods) {
        out.position[m].push(pos[m]);
        out.error[m].push(Math.hypot(pos[m][0] - truth[0], pos[m][1] - truth[1]));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// One-dimensional scenario shared by the filter, estimator, and smoother widgets
// ---------------------------------------------------------------------------------------------------------------

/** Time step of the one-dimensional scenario (s). */
export const LINE_DT = 0.05;

/** Inputs for {@link makeLineScenario}. */
export interface LineScenarioParams {
  /** Simulated time (s). */
  duration: number;
  /** Odometry noise: standard deviation added per meter driven (m per √m). */
  odometryNoise: number;
  /** Vision measurement noise, standard deviation (m). */
  visionNoise: number;
  /** Vision measurements per second. At most 1 / {@link LINE_DT}. */
  visionRate: number;
  /** Time span with no tags in view (s), or `null` for none. */
  gap: [number, number] | null;
  /** A shove the wheels don't see: at `time`, the robot moves `size` meters. `null` for none. */
  shove: { time: number; size: number } | null;
  /** Number of bad vision measurements (off by 1 to 2 m), placed right after the gap, or spread out if there is none. */
  outliers: number;
  seed?: number;
}

/** A vision measurement in the one-dimensional scenario. */
export interface LineMeasurement {
  /** Index of the time step it belongs to. */
  k: number;
  /** Measured position (m). */
  z: number;
  /** Whether this is one of the injected bad measurements. */
  outlier: boolean;
}

/** A robot driving back and forth along a line, with noisy odometry and vision. */
export interface LineScenario {
  /** Time of each step (s). */
  t: number[];
  /** True position at each step (m). */
  truth: number[];
  /** Odometry movement reported from step `k` to `k + 1` (m). */
  odometry: number[];
  /** Variance the odometry adds over each step, as a filter would model it (m²). */
  odometryVariance: number[];
  /** Vision measurements, sorted by step. */
  measurements: LineMeasurement[];
  /** Vision noise standard deviation (m). */
  visionNoise: number;
}

/** Builds a {@link LineScenario}: the robot swings between 1 m and 7 m on an 8-second cycle. */
export function makeLineScenario(params: LineScenarioParams): LineScenario {
  const random = rng(params.seed ?? 2702);
  const visionRandom = rng((params.seed ?? 2702) + 1);
  const steps = Math.round(params.duration / LINE_DT);
  const driven = (time: number) => 4 + 3 * Math.sin((2 * Math.PI * time) / 8);
  const t: number[] = [];
  const truth: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const time = k * LINE_DT;
    const shoved = params.shove && time >= params.shove.time ? params.shove.size : 0;
    t.push(time);
    truth.push(driven(time) + shoved);
  }
  const odometry: number[] = [];
  const odometryVariance: number[] = [];
  for (let k = 0; k < steps; k++) {
    // The wheels only see the driven movement, not the shove.
    const moved = driven(t[k + 1]) - driven(t[k]);
    const variance = params.odometryNoise ** 2 * Math.abs(moved) + 1e-8;
    odometryVariance.push(variance);
    odometry.push(moved + random.normal() * Math.sqrt(variance));
  }

  const every = Math.max(1, Math.round(1 / (params.visionRate * LINE_DT)));
  const gap = params.gap;
  const inGap = (time: number) => gap !== null && time >= gap[0] && time < gap[1];
  const candidates: number[] = [];
  for (let k = every; k <= steps; k += every) if (!inGap(t[k])) candidates.push(k);
  // Bad measurements go right after the gap, where a filter trusts vision most. Without a gap, spread them out.
  const bad = new Set<number>();
  if (params.outliers > 0) {
    const first = gap ? candidates.findIndex((k) => t[k] >= gap[1]) : 0;
    const spacing = gap ? 1 : Math.floor(candidates.length / (params.outliers + 1));
    for (let i = 0; i < params.outliers; i++) {
      const idx = gap ? first + i * spacing : (i + 1) * spacing;
      if (idx >= 0 && idx < candidates.length) bad.add(candidates[idx]);
    }
  }
  // All bad measurements point the same way, as a flipped single-tag solve would.
  const side = visionRandom.uniform() < 0.5 ? -1 : 1;
  const measurements = candidates.map((k): LineMeasurement => {
    const outlier = bad.has(k);
    const offset = outlier ? side * (1 + visionRandom.uniform()) : 0;
    return { k, z: truth[k] + offset + visionRandom.normal() * params.visionNoise, outlier };
  });
  return { t, truth, odometry, odometryVariance, measurements, visionNoise: params.visionNoise };
}

/** Standard deviation of the starting position, known from where the robot was placed (m). */
const START_SIGMA = 0.05;

/** Output of a one-dimensional estimator on a {@link LineScenario}. */
export interface LineEstimate {
  /** Estimate at each step, as known at that moment (m). */
  estimate: number[];
  /** Standard deviation the estimator claims at each step (m). `NaN` if it doesn't track one. */
  sigma: number[];
  /** Gain applied to each measurement, in the order of {@link LineScenario.measurements}. */
  gain: number[];
}

/**
 * A textbook one-dimensional Kalman filter: predict with odometry, correct with each vision measurement. With a
 * `gate`, measurements more than `gate` standard deviations of the innovation away from the estimate are rejected
 * (gain 0).
 */
export function runKalman(s: LineScenario, gate = Infinity): LineEstimate {
  let x = s.truth[0];
  let p = START_SIGMA ** 2;
  const r = s.visionNoise ** 2;
  const out: LineEstimate = { estimate: [], sigma: [], gain: [] };
  let m = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (k > 0) {
      x += s.odometry[k - 1];
      p += s.odometryVariance[k - 1];
    }
    while (m < s.measurements.length && s.measurements[m].k === k) {
      const innovation = s.measurements[m].z - x;
      const gain = Math.abs(innovation) > gate * Math.sqrt(p + r) ? 0 : p / (p + r);
      x += gain * innovation;
      p *= 1 - gain;
      out.gain.push(gain);
      m++;
    }
    out.estimate.push(x);
    out.sigma.push(Math.sqrt(p));
  }
  return out;
}

/**
 * WPILib's gain for one axis of its pose estimators. Each vision measurement moves the estimate this fraction of the
 * way toward it. The same as `q / (q + √(q r))` in `PoseEstimator`, with `q` and `r` the squared standard deviations.
 */
export const wpilibGain = (stateStdDev: number, visionStdDev: number) =>
  stateStdDev <= 0 ? 0 : stateStdDev / (stateStdDev + visionStdDev);

/** WPILib's pose estimator in one dimension: odometry plus a fixed-fraction correction toward each measurement. */
export function runWpilib(s: LineScenario, stateStdDev: number, visionStdDev: number): LineEstimate {
  const gain = wpilibGain(stateStdDev, visionStdDev);
  let x = s.truth[0];
  const out: LineEstimate = { estimate: [], sigma: [], gain: [] };
  let m = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (k > 0) x += s.odometry[k - 1];
    while (m < s.measurements.length && s.measurements[m].k === k) {
      x += gain * (s.measurements[m].z - x);
      out.gain.push(gain);
      m++;
    }
    out.estimate.push(x);
    out.sigma.push(NaN);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Factor-graph smoothing
// ---------------------------------------------------------------------------------------------------------------

/** Loss applied to vision factors. `gaussian` is plain least squares. */
export type RobustKernel = "gaussian" | "huber" | "cauchy";

/** The usual tuning constants, which keep 95% of least squares' efficiency on clean Gaussian noise. */
const HUBER_K = 1.345;
const CAUCHY_C = 2.3849;

/** Reweighting factor for a residual `u` measured in standard deviations. */
function robustWeight(kernel: RobustKernel, u: number): number {
  const a = Math.abs(u);
  if (kernel === "huber") return a <= HUBER_K ? 1 : HUBER_K / a;
  if (kernel === "cauchy") return 1 / (1 + (u / CAUCHY_C) ** 2);
  return 1;
}

/**
 * Solves the chain factor graph over steps `0..last`: a prior on step 0, an odometry factor between each pair of
 * steps, and a vision factor on each measured step. The graph is linear, so each solve is one tridiagonal system.
 * Robust kernels use iteratively reweighted least squares, starting from `init`.
 */
function solveChain(s: LineScenario, last: number, kernel: RobustKernel, init: number[]): number[] {
  const n = last + 1;
  const r = s.visionNoise ** 2;
  const measured = s.measurements.filter((m) => m.k <= last);
  let x = init.slice(0, n);
  const iterations = kernel === "gaussian" ? 1 : 10;
  for (let it = 0; it < iterations; it++) {
    // Normal equations A x = b. A is tridiagonal: `diag`, and `off` between step i and i + 1.
    const diag = new Float64Array(n);
    const off = new Float64Array(n);
    const b = new Float64Array(n);
    diag[0] += 1 / START_SIGMA ** 2;
    b[0] += s.truth[0] / START_SIGMA ** 2;
    for (let i = 0; i < last; i++) {
      const w = 1 / s.odometryVariance[i];
      diag[i] += w;
      diag[i + 1] += w;
      off[i] -= w;
      b[i] -= w * s.odometry[i];
      b[i + 1] += w * s.odometry[i];
    }
    for (const m of measured) {
      const w = robustWeight(kernel, (x[m.k] - m.z) / s.visionNoise) / r;
      diag[m.k] += w;
      b[m.k] += w * m.z;
    }
    // Thomas algorithm.
    const c = new Float64Array(n);
    const d = new Float64Array(n);
    c[0] = off[0] / diag[0];
    d[0] = b[0] / diag[0];
    for (let i = 1; i < n; i++) {
      const denom = diag[i] - off[i - 1] * c[i - 1];
      c[i] = off[i] / denom;
      d[i] = (b[i] - off[i - 1] * d[i - 1]) / denom;
    }
    const next = new Array<number>(n);
    next[n - 1] = d[n - 1];
    for (let i = n - 2; i >= 0; i--) next[i] = d[i] - c[i] * next[i + 1];
    x = next;
  }
  return x;
}

/** Output of {@link runSmoother}. */
export interface SmootherResult {
  /** Newest estimate at each step, as an incremental smoother (like iSAM2) reports it at that moment (m). */
  live: number[];
  /** The whole trajectory solved at the end, with every measurement (m). */
  hindsight: number[];
  /** Weight the final solve gave each vision measurement, from 0 (ignored) to 1 (fully trusted). */
  weights: number[];
}

/**
 * Runs the chain factor graph online. After each new measurement, re-solve everything so far (warm-started from the
 * previous solution, as iSAM2 does) and report the newest position. Also returns the trajectory solved at the end.
 */
export function runSmoother(s: LineScenario, kernel: RobustKernel): SmootherResult {
  const live: number[] = [];
  let guess: number[] = [s.truth[0]];
  let m = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (k > 0) guess.push(guess[k - 1] + s.odometry[k - 1]);
    let measured = false;
    while (m < s.measurements.length && s.measurements[m].k === k) {
      measured = true;
      m++;
    }
    // Without a new measurement, the solution doesn't change: the newest position is the last one plus odometry.
    if (measured) guess = solveChain(s, k, kernel, guess);
    live.push(guess[k]);
  }
  const hindsight = solveChain(s, s.t.length - 1, kernel, guess);
  const weights = s.measurements.map((mm) => robustWeight(kernel, (hindsight[mm.k] - mm.z) / s.visionNoise));
  return { live, hindsight, weights };
}

/** Root-mean-square of `estimate - truth` over steps `from` to the end. */
export function rmsError(estimate: number[], truth: number[], from = 0): number {
  let sum = 0;
  let n = 0;
  for (let i = from; i < truth.length; i++) {
    const e = estimate[i] - truth[i];
    if (Number.isFinite(e)) {
      sum += e * e;
      n++;
    }
  }
  return n ? Math.sqrt(sum / n) : NaN;
}
