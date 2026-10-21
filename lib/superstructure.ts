/**
 * Side-view model of a pick-and-place superstructure: an elevator carrying a pivoting arm, on a drivetrain with an
 * intake in front of the elevator. Used by the Superstructure page to show why moves have to be sequenced.
 *
 * Units are inches and degrees. x points toward the robot's front, z points up from the carpet, and the arm angle is
 * measured from horizontal-forward, positive up (so -90° points straight down).
 */

/** Fixed geometry of the model robot. */
export const GEOMETRY = {
  /** Front edge of the frame perimeter. The frame runs from -FRAME to +FRAME. */
  frame: 14,
  /** Bumper thickness outside the frame. */
  bumper: 3,
  /** Top of the drivetrain and bumpers. */
  bodyTop: 8,
  /** Bottom of the bumpers. */
  bumperBottom: 2,
  /** x of the elevator and the arm pivot. */
  pivotX: 3,
  /** Pivot height with the elevator at the bottom. */
  pivotBase: 32,
  /** Elevator travel. */
  travel: 56,
  /** Arm length, pivot to the tip of the end effector. */
  armLength: 20,
  /** The intake and indexer in front of the elevator, as a box. */
  intake: { x0: 7, x1: 14, z0: 8, z1: 22 },
} as const;

/** Arm angle at which the end effector tucks straight down behind the intake. */
export const TUCK = -90;

/** A pose of the superstructure: elevator travel (in) and arm angle (°). */
export interface Pose {
  elevator: number;
  arm: number;
}

/** What a pose runs into, if anything. */
export type Collision = "intake" | "drivetrain" | "carpet" | null;

/** Height of the arm pivot (in). */
export const pivotZ = (p: Pose) => GEOMETRY.pivotBase + p.elevator;

/** Tip of the end effector, `[x, z]` in inches. */
export const tip = (p: Pose): [number, number] => {
  const a = (p.arm * Math.PI) / 180;
  return [GEOMETRY.pivotX + GEOMETRY.armLength * Math.cos(a), pivotZ(p) + GEOMETRY.armLength * Math.sin(a)];
};

/** How far the tip reaches past the frame perimeter (in), or 0 if it is inside. */
export const extension = (p: Pose) => Math.max(0, Math.abs(tip(p)[0]) - GEOMETRY.frame);

const inBox = (x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }) =>
  x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

/** The first thing the arm touches in pose `p`, checked at points along its length. */
export const collision = (p: Pose): Collision => {
  const [tx, tz] = tip(p);
  const px = GEOMETRY.pivotX;
  const pz = pivotZ(p);
  const outer = GEOMETRY.frame + GEOMETRY.bumper;
  const body = { x0: -outer, x1: outer, z0: 0, z1: GEOMETRY.bodyTop };
  for (let i = 1; i <= 20; i++) {
    const s = i / 20;
    const x = px + s * (tx - px);
    const z = pz + s * (tz - pz);
    if (z <= 0) return "carpet";
    if (inBox(x, z, GEOMETRY.intake)) return "intake";
    if (inBox(x, z, body)) return "drivetrain";
  }
  return null;
};

/** Lowest elevator travel (in) at which the arm can point anywhere without touching the intake or drivetrain. */
export const SAFE_ELEVATOR = GEOMETRY.intake.z1 + GEOMETRY.armLength - GEOMETRY.pivotBase;

/** Named target poses. Scoring tips sit about 2 in above the 2025 reef branch tops (L2 31.9 in, L3 47.6 in, L4 72 in). */
export const PRESETS = {
  handoff: { label: "Handoff", pose: { elevator: 0, arm: TUCK } },
  l2: { label: "L2", pose: { elevator: 13.5, arm: -35 } },
  l3: { label: "L3", pose: { elevator: 29.5, arm: -35 } },
  l4: { label: "L4", pose: { elevator: 54, arm: -35 } },
} as const satisfies Record<string, { label: string; pose: Pose }>;

export type PresetId = keyof typeof PRESETS;

/** Reef branch tops for the 2025 game (in), drawn as targets. */
export const REEF_LEVELS = [
  { label: "L2", z: 31.875 },
  { label: "L3", z: 47.625 },
  { label: "L4", z: 72 },
] as const;

/**
 * How the two joints are coordinated.
 * - `together`: both head straight for the target at full speed.
 * - `sequence`: one at a time. Elevator to the safe height (or the target, if higher), then the arm, then the
 *   elevator down to the target.
 * - `interlock`: both move at once, but the arm only moves above the safe height, and the elevator only goes below
 *   it with the arm tucked.
 */
export type Strategy = "together" | "sequence" | "interlock";

/** Top speeds of the two joints. */
export interface Speeds {
  /** Elevator speed (in/s). */
  elevator: number;
  /** Arm speed (°/s). */
  arm: number;
}

/** Default joint speeds: full travel in about 0.7 s, a quarter turn in about 0.33 s. */
export const DEFAULT_SPEEDS: Speeds = { elevator: 80, arm: 270 };

/** A simulated move: poses at a fixed time step, and the first collision. */
export interface Move {
  dt: number;
  poses: Pose[];
  /** Index of the first pose that collides, or -1. */
  hitIndex: number;
  hit: Collision;
}

const step = (from: number, to: number, maxStep: number) =>
  Math.abs(to - from) <= maxStep ? to : from + Math.sign(to - from) * maxStep;

/**
 * Moves from `start` to `target` with `strategy`. Each joint runs at constant top speed toward its current goal, with
 * no acceleration limit. The goals change with the strategy's rules.
 */
export const simulateMove = (
  start: Pose,
  target: Pose,
  strategy: Strategy,
  speeds: Speeds = DEFAULT_SPEEDS,
  dt = 0.005
): Move => {
  const poses: Pose[] = [{ ...start }];
  let p = { ...start };
  let phase = 0;
  const lift = Math.max(target.elevator, SAFE_ELEVATOR);
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  for (let n = 0; n < 5000; n++) {
    let eGoal = target.elevator;
    let aGoal = target.arm;
    if (strategy === "sequence") {
      // Phase 0: elevator to the lift height. Phase 1: arm to target. Phase 2: elevator to target.
      if (phase === 0 && close(p.arm, target.arm)) phase = 2;
      if (phase === 0 && close(p.elevator, lift)) phase = 1;
      if (phase === 1 && close(p.arm, target.arm)) phase = 2;
      if (phase === 0) [eGoal, aGoal] = [lift, p.arm];
      else if (phase === 1) [eGoal, aGoal] = [p.elevator, target.arm];
    } else if (strategy === "interlock") {
      // The arm waits below the safe height. The elevator waits at the safe height until the arm is in place.
      if (p.elevator < SAFE_ELEVATOR - 1e-9) aGoal = p.arm;
      if (!close(p.arm, target.arm)) eGoal = Math.max(target.elevator, SAFE_ELEVATOR);
    }
    const next = {
      elevator: step(p.elevator, eGoal, speeds.elevator * dt),
      arm: step(p.arm, aGoal, speeds.arm * dt),
    };
    // Stop at the target, or if the rules leave nothing able to move.
    if (close(next.elevator, p.elevator) && close(next.arm, p.arm)) break;
    p = next;
    poses.push(p);
  }
  const hitIndex = poses.findIndex((q) => collision(q) !== null);
  return { dt, poses, hitIndex, hit: hitIndex >= 0 ? collision(poses[hitIndex]) : null };
};
