/** Commutation mode; the same motor has different effective constants in each. */
export type Commutation = "trap" | "foc";

/** Electromechanical constants for one motor in one commutation mode. */
export interface MotorConstants {
  /** Free speed at 12 V (RPM). */
  freeSpeedRpm: number;
  /** Stall torque at 12 V (N·m). */
  stallTorque: number;
  /** Stall current at 12 V (A). */
  stallCurrent: number;
  /** Torque constant (N·m/A). */
  kt: number;
  /** Back-EMF constant (V·s/rad). */
  ke: number;
  /** Effective resistance (Ω), from 12 V / stall current. */
  r: number;
}

/** A motor with published values for both commutation modes. */
export interface Motor {
  /** Display name. */
  name: string;
  trap: MotorConstants;
  foc: MotorConstants;
}

const NOMINAL_VOLTAGE = 12;

/** Derives kt, ke, and R from the published free speed and stall point, as in the Motor Constants page. */
function derive(freeSpeedRpm: number, stallTorque: number, stallCurrent: number): MotorConstants {
  const freeSpeedRadPerSec = (freeSpeedRpm * 2 * Math.PI) / 60;
  return {
    freeSpeedRpm,
    stallTorque,
    stallCurrent,
    kt: stallTorque / stallCurrent,
    ke: NOMINAL_VOLTAGE / freeSpeedRadPerSec,
    r: NOMINAL_VOLTAGE / stallCurrent,
  };
}

/** Published WCP specifications for the Kraken motors. */
export const MOTORS = {
  x60: {
    name: "Kraken X60",
    trap: derive(6000, 7.09, 366),
    foc: derive(5800, 9.37, 483),
  },
  x44: {
    name: "Kraken X44",
    trap: derive(7758, 4.11, 279),
    foc: derive(7368, 5.01, 329),
  },
} satisfies Record<string, Motor>;

/** Identifier of a motor in {@link MOTORS}. */
export type MotorId = keyof typeof MOTORS;

/** Converts RPM to rad/s. */
export const rpmToRadPerSec = (rpm: number) => (rpm * 2 * Math.PI) / 60;

/**
 * Largest current the drive can push at rotor speed `omega` (rad/s) from supply voltage `supply` (V), before any
 * current limit: the voltage left after back-EMF, divided by resistance. Applies to voltage and torque-current modes.
 */
export const maxCurrentAt = ({ ke, r }: MotorConstants, supply: number, omega: number) =>
  Math.max(0, (supply - ke * Math.abs(omega)) / r);
