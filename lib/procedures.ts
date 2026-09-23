/** Output family a tuning procedure is written for. */
export type ProcedureMode = "voltage" | "torque";

/** Display names for {@link ProcedureMode}, with the unit the gains are in. */
export const MODE_LABEL: Record<ProcedureMode, string> = {
  voltage: "Voltage (V)",
  torque: "Torque-current (A)",
};

/** A mechanism with one tuning procedure per output family. */
export interface MechanismProcedures {
  mechanism: string;
  voltage: string;
  torque: string;
}

/** A procedure that isn't tied to one mechanism. */
export interface GeneralProcedure {
  title: string;
  href: string;
  description: string;
  mode?: ProcedureMode;
}

const VOLTAGE = "/docs/guides/ctre/voltage";
const TORQUE = "/docs/guides/ctre/torque-current";

/**
 * Every mechanism tuning procedure in the guide, linked by heading anchor. This is the single source for the
 * procedure index page and the jump links at the top of each mechanism section. Update it when a procedure heading is
 * added or renamed.
 */
export const MECHANISM_PROCEDURES: MechanismProcedures[] = [
  { mechanism: "Flywheel", voltage: `${VOLTAGE}#213-tuning-procedure`, torque: `${TORQUE}#313-tuning-procedure` },
  { mechanism: "Turret", voltage: `${VOLTAGE}#224-tuning-procedure`, torque: `${TORQUE}#323-tuning-procedure` },
  { mechanism: "Arm", voltage: `${VOLTAGE}#235-tuning-procedure`, torque: `${TORQUE}#333-tuning-procedure` },
  { mechanism: "Elevator", voltage: `${VOLTAGE}#245-tuning-procedure`, torque: `${TORQUE}#344-tuning-procedure` },
  {
    mechanism: "Linear deployment",
    voltage: `${VOLTAGE}#253-tuning-procedure-abbreviated`,
    torque: `${TORQUE}#353-tuning-procedure`,
  },
];

/** Procedures that apply across mechanisms. */
export const GENERAL_PROCEDURES: GeneralProcedure[] = [
  {
    title: "General tuning workflow",
    href: "/docs/guides/ctre/foundation#15-general-tuning-workflow",
    description: "The order every tune follows: units, StaticFeedforwardSign, feedforward, then kP, kD, kI.",
  },
  {
    title: "Tuning Motion Magic Expo parameters",
    href: "/docs/guides/ctre/motion-magic-expo#142-tuning-motion-magic-expo-parameters",
    description: "Setting and checking MotionMagicExpo_kV and MotionMagicExpo_kA on the robot.",
  },
  {
    title: "Profiled tuning order",
    href: `${TORQUE}#recommended-order-for-tuning-a-profiled-torque-current-controller`,
    description: "Adding kA and kV for Motion Magic in torque-current mode.",
    mode: "torque",
  },
];

/** Looks up the procedures for one mechanism by its display name. */
export const findMechanism = (mechanism: string) => MECHANISM_PROCEDURES.find((p) => p.mechanism === mechanism);
