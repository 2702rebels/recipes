/** Output family of the simulated closed loop. */
export type LoopMode = "voltage" | "torque";

/** Inputs for {@link simulateStep}. */
export interface StepSimParams {
  mode: LoopMode;
  /** Static feedforward, applied with the sign of the error (UseClosedLoopSign). V or A. */
  kS: number;
  /** V or A per mechanism rotation of error. */
  kP: number;
  /** V or A per mechanism rotation/s of error rate. */
  kD: number;
  /** Step size (mechanism rotations). */
  step: number;
  /** Stator current limit (A). Applies in both modes. */
  currentLimit: number;
  /** Delay between measuring and applying output (s). */
  latency: number;
  /** Supply voltage (V). */
  supply: number;
  /** Gear reduction, motor rotations per mechanism rotation. */
  gear: number;
  /** Mechanism inertia about its axis (kg·m²). */
  inertia: number;
  /** Coulomb friction at the mechanism (N·m). */
  friction: number;
  /** Motor torque constant (N·m/A). */
  kt: number;
  /** Motor back-EMF constant (V·s/rad). */
  ke: number;
  /** Motor effective resistance (Ω). */
  r: number;
  /** Simulated time (s). */
  duration: number;
}

/** Result of {@link simulateStep}, sampled once per control period. */
export interface StepSimResult {
  /** Time (s). */
  t: number[];
  /** Mechanism position (rotations). */
  position: number[];
  /** Motor current (A). */
  current: number[];
  /** Controller output before limits (V or A, matching the mode). */
  output: number[];
  /** Overshoot as a fraction of the step (0 if none). */
  overshoot: number;
  /** Time after which the error stays within 2% of the step (s), or NaN if it never settles. */
  settlingTime: number;
  /** Error at the end of the run (rotations). */
  finalError: number;
  /** Largest current magnitude (A). */
  peakCurrent: number;
}

const CONTROL_DT = 0.001; // Phoenix 6 runs its closed loop at 1 kHz.
const SUBSTEPS = 10;

/**
 * Simulates a position step on a geared, gravity-free mechanism (a turret) with a PD + kS controller in voltage or
 * torque-current mode. The current loop is ideal, and friction is Coulomb only.
 */
export function simulateStep(p: StepSimParams): StepSimResult {
  const steps = Math.round(p.duration / CONTROL_DT);
  const delaySteps = Math.max(0, Math.round(p.latency / CONTROL_DT));
  const dt = CONTROL_DT / SUBSTEPS;

  let theta = 0;
  let omega = 0; // mechanism rotations/s
  const history: { theta: number; omega: number }[] = [];
  const out: StepSimResult = {
    t: [],
    position: [],
    current: [],
    output: [],
    overshoot: 0,
    settlingTime: NaN,
    finalError: 0,
    peakCurrent: 0,
  };

  for (let k = 0; k <= steps; k++) {
    history.push({ theta, omega });
    const seen = history[Math.max(0, history.length - 1 - delaySteps)];
    const error = p.step - seen.theta;
    const sign = Math.abs(error) > 1e-6 ? Math.sign(error) : 0;
    // Setpoint is constant, so the error rate is minus the measured velocity.
    const u = p.kS * sign + p.kP * error - p.kD * seen.omega;

    let current = 0;
    for (let s = 0; s < SUBSTEPS; s++) {
      const backEmf = p.ke * 2 * Math.PI * p.gear * omega;
      if (p.mode === "voltage") {
        const volts = Math.max(-p.supply, Math.min(p.supply, u));
        current = (volts - backEmf) / p.r;
      } else {
        // The current loop can only reach currents the remaining voltage can push.
        const lo = (-p.supply - backEmf) / p.r;
        const hi = (p.supply - backEmf) / p.r;
        current = Math.max(lo, Math.min(hi, u));
      }
      current = Math.max(-p.currentLimit, Math.min(p.currentLimit, current));

      const drive = p.gear * p.kt * current;
      let torque: number;
      if (Math.abs(omega) < 1e-6 && Math.abs(drive) <= p.friction) {
        omega = 0;
        torque = 0;
      } else {
        const dir = Math.abs(omega) >= 1e-6 ? Math.sign(omega) : Math.sign(drive);
        torque = drive - p.friction * dir;
      }
      const prev = omega;
      omega += (torque / (2 * Math.PI * p.inertia)) * dt;
      // Friction can stop the mechanism but not reverse it within one substep.
      if (prev !== 0 && Math.sign(omega) !== Math.sign(prev) && Math.abs(drive) <= p.friction) omega = 0;
      theta += omega * dt;
    }

    out.t.push(k * CONTROL_DT);
    out.position.push(theta);
    out.current.push(current);
    out.output.push(u);
    out.peakCurrent = Math.max(out.peakCurrent, Math.abs(current));
  }

  const peak = Math.max(...out.position);
  out.overshoot = p.step > 0 ? Math.max(0, (peak - p.step) / p.step) : 0;
  const band = 0.02 * Math.abs(p.step);
  let lastOutside = -1;
  out.position.forEach((x, i) => {
    if (Math.abs(p.step - x) > band) lastOutside = i;
  });
  out.settlingTime = lastOutside < out.position.length - 1 ? out.t[lastOutside + 1] : NaN;
  out.finalError = p.step - out.position[out.position.length - 1];
  return out;
}
