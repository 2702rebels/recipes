import { maxCurrentAt, rpmToRadPerSec, type MotorConstants } from "./motors";

/** Chassis velocity: `vx` forward and `vy` left (m/s), `omega` counterclockwise (rad/s). */
export interface ChassisSpeeds {
  vx: number;
  vy: number;
  omega: number;
}

/** A module's position on the robot (m), in the robot frame: x forward, y left. */
export interface ModuleLocation {
  name: string;
  x: number;
  y: number;
}

/** What one module is told to do: wheel speed (m/s) and steering angle (rad, counterclockwise from robot forward). */
export interface ModuleState {
  speed: number;
  angle: number;
}

/** Module locations for a rectangular drivetrain, in WPILib's usual order: front left, front right, back left, back right. */
export const rectangleModules = (wheelbase: number, trackWidth: number): ModuleLocation[] => [
  { name: "FL", x: wheelbase / 2, y: trackWidth / 2 },
  { name: "FR", x: wheelbase / 2, y: -trackWidth / 2 },
  { name: "BL", x: -wheelbase / 2, y: trackWidth / 2 },
  { name: "BR", x: -wheelbase / 2, y: -trackWidth / 2 },
];

/** Rotates a field-relative velocity into the robot frame, given the robot's heading (rad). */
export const fieldToRobot = ({ vx, vy, omega }: ChassisSpeeds, heading: number): ChassisSpeeds => {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { vx: vx * c + vy * s, vy: -vx * s + vy * c, omega };
};

/**
 * Inverse kinematics: the speed and angle of each module for a robot-relative chassis velocity. Each module moves
 * with the robot's center plus `omega` times its position turned 90°. A module with no speed keeps angle 0 here.
 */
export const toModuleStates = ({ vx, vy, omega }: ChassisSpeeds, modules: ModuleLocation[]): ModuleState[] =>
  modules.map(({ x, y }) => {
    const mx = vx - omega * y;
    const my = vy + omega * x;
    return { speed: Math.hypot(mx, my), angle: Math.atan2(my, mx) };
  });

/** Scales every module's speed by the same factor so none exceeds `maxSpeed`. Returns the states and the factor. */
export const desaturate = (states: ModuleState[], maxSpeed: number): { states: ModuleState[]; scale: number } => {
  const fastest = Math.max(...states.map((s) => s.speed));
  const scale = fastest > maxSpeed ? maxSpeed / fastest : 1;
  return { states: states.map((s) => ({ ...s, speed: s.speed * scale })), scale };
};

/**
 * Instantaneous center of rotation in the robot frame (m): the point every module's velocity circles around.
 * Undefined when the robot isn't turning.
 */
export const rotationCenter = ({ vx, vy, omega }: ChassisSpeeds): [number, number] | undefined =>
  Math.abs(omega) < 1e-9 ? undefined : [-vy / omega, vx / omega];

/**
 * Field pose `[x, y, heading]` after driving for each time in `times` (s) from the origin at `heading`. A
 * robot-relative command turns with the robot, so it drives an arc. A field-relative one is re-rotated by the gyro
 * every loop, so the robot drives a straight line while it turns.
 */
export const predictPath = (
  speeds: ChassisSpeeds,
  fieldRelative: boolean,
  heading: number,
  times: number[]
): [number, number, number][] =>
  times.map((t) => {
    const theta = heading + speeds.omega * t;
    if (fieldRelative) return [speeds.vx * t, speeds.vy * t, theta];
    // A constant robot-relative command drives one arc.
    return driveArc([0, 0, heading], speeds, t);
  });

/**
 * Moves a field pose `[x, y, heading]` along a constant robot-relative velocity for `dt` seconds. The robot turns as it
 * goes, so it follows an arc (the pose exponential, WPILib's `Pose2d.exp`).
 */
export const driveArc = ([x, y, heading]: [number, number, number], speeds: ChassisSpeeds, dt: number) => {
  const dTheta = speeds.omega * dt;
  const a = Math.abs(dTheta) < 1e-9 ? 1 : Math.sin(dTheta) / dTheta;
  const b = Math.abs(dTheta) < 1e-9 ? 0 : (1 - Math.cos(dTheta)) / dTheta;
  const dx = (a * speeds.vx - b * speeds.vy) * dt;
  const dy = (b * speeds.vx + a * speeds.vy) * dt;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [x + dx * c - dy * s, y + dx * s + dy * c, heading + dTheta] as [number, number, number];
};

/**
 * WPILib's `ChassisSpeeds.discretize`: the robot-relative speeds that, held for `dt` seconds along an arc, end where
 * the requested speeds would put the robot if it moved in a straight line while turning. It takes the pose log of the
 * requested movement and divides by `dt`.
 */
export const discretize = ({ vx, vy, omega }: ChassisSpeeds, dt: number): ChassisSpeeds => {
  const x = vx * dt;
  const y = vy * dt;
  const dTheta = omega * dt;
  const half = dTheta / 2;
  const cosMinusOne = Math.cos(dTheta) - 1;
  const h = Math.abs(cosMinusOne) < 1e-9 ? 1 - (dTheta * dTheta) / 12 : -(half * Math.sin(dTheta)) / cosMinusOne;
  return { vx: (h * x + half * y) / dt, vy: (h * y - half * x) / dt, omega };
};

/** One robot's path in {@link simulateSkew}: field poses `[x, y, heading]`, several per loop. */
export type SkewPath = [number, number, number][];

/** Result of {@link simulateSkew}. */
export interface SkewResult {
  /** Path holding the plain field-relative command for each loop. */
  plain: SkewPath;
  /** Path holding the discretized command for each loop. */
  discretized: SkewPath;
  /** Index into the paths of the end of each loop. */
  loopEnds: number[];
  /** Loop period (s). */
  dt: number;
}

/**
 * A field-relative drive straight along field +x at `speed` (m/s) while spinning at `spinRate` (rad/s). Every loop the
 * code reads the true heading, turns the request into robot-relative speeds, optionally discretizes them, and holds
 * them for the loop. Wheels follow their commands exactly, so all the error comes from holding speeds while turning.
 */
export const simulateSkew = ({
  speed,
  spinRate,
  rateHz,
  distance,
  substeps = 6,
}: {
  speed: number;
  spinRate: number;
  rateHz: number;
  distance: number;
  /** Points recorded inside each loop, for drawing the arcs. */
  substeps?: number;
}): SkewResult => {
  const dt = 1 / rateHz;
  const loops = Math.ceil(distance / speed / dt);
  const run = (useDiscretize: boolean) => {
    let pose: [number, number, number] = [0, 0, 0];
    const path: SkewPath = [pose];
    for (let k = 0; k < loops; k++) {
      const request = fieldToRobot({ vx: speed, vy: 0, omega: spinRate }, pose[2]);
      const held = useDiscretize ? discretize(request, dt) : request;
      const start = pose;
      for (let j = 1; j <= substeps; j++) path.push(driveArc(start, held, (dt * j) / substeps));
      pose = path[path.length - 1];
    }
    return path;
  };
  return {
    plain: run(false),
    discretized: run(true),
    loopEnds: Array.from({ length: loops + 1 }, (_, k) => k * substeps),
    dt,
  };
};

/** Drivetrain inputs for the speed and traction model. */
export interface DriveGearing {
  motor: MotorConstants;
  /** Drive gear reduction, motor rotations per wheel rotation. */
  ratio: number;
  /** Wheel radius (m). */
  wheelRadius: number;
  /** Robot mass with bumpers and battery (kg). */
  mass: number;
  /** Coefficient of friction between tread and carpet. */
  mu: number;
  /** Stator current limit per drive motor (A). */
  statorLimit: number;
  /** Number of drive motors (one per module). */
  modules?: number;
  /** Supply voltage at the motor (V). */
  supply?: number;
}

const G = 9.81;

/** Robot speed (m/s) when the drive motors spin at free speed. */
export const freeSpeed = ({ motor, ratio, wheelRadius }: DriveGearing) =>
  (rpmToRadPerSec(motor.freeSpeedRpm) / ratio) * wheelRadius;

/**
 * Stator current (A) per drive motor at which the wheels start to slip: each module carries a quarter of the weight
 * and can push with at most `mu` times that.
 */
export const slipCurrent = ({ motor, ratio, wheelRadius, mass, mu, modules = 4 }: DriveGearing) =>
  (((mu * mass * G) / modules) * wheelRadius) / ratio / motor.kt;

/**
 * Forward acceleration (m/s²) at robot speed `v` (m/s). The least of three limits: the stator current limit, the
 * current the supply voltage can push against back-EMF, and traction.
 */
export const accelerationAt = (g: DriveGearing, v: number) => {
  const { motor, ratio, wheelRadius, mass, mu, statorLimit, modules = 4, supply = 12 } = g;
  const rotorSpeed = (v / wheelRadius) * ratio;
  const current = Math.min(statorLimit, maxCurrentAt(motor, supply, rotorSpeed));
  const force = (modules * motor.kt * current * ratio) / wheelRadius;
  return Math.min(force / mass, mu * G);
};

/** A straight-line sprint from rest. */
export interface Sprint {
  /** Time (s), speed (m/s), and distance (m) at each step. */
  t: number[];
  v: number[];
  x: number[];
}

/** Simulates a straight-line sprint from rest for `duration` seconds, with full throttle on every module. */
export const simulateSprint = (g: DriveGearing, duration: number, dt = 0.002): Sprint => {
  const out: Sprint = { t: [0], v: [0], x: [0] };
  let v = 0;
  let x = 0;
  for (let t = dt; t <= duration + dt / 2; t += dt) {
    // Midpoint step, so the speed doesn't overshoot the free speed.
    const mid = v + (accelerationAt(g, v) * dt) / 2;
    const a = accelerationAt(g, mid);
    x += (v + (a * dt) / 2) * dt;
    v += a * dt;
    out.t.push(t);
    out.v.push(v);
    out.x.push(x);
  }
  return out;
};

/** Time (s) at which a sprint first covers `distance` (m), or NaN if it never does. */
export const timeToDistance = ({ t, x }: Sprint, distance: number) => {
  const i = x.findIndex((d) => d >= distance);
  if (i <= 0) return Number.NaN;
  // Interpolate between the two samples around the distance.
  return t[i - 1] + ((distance - x[i - 1]) / (x[i] - x[i - 1])) * (t[i] - t[i - 1]);
};
