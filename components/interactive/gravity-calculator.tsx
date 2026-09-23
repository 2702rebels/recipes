"use client";

import { useMemo, useState } from "react";

import { MOTORS, type Commutation, type MotorId } from "@/lib/motors";

import { fmt, MotorPicker, Readout, Segmented, Slider, Widget } from "./controls";

type Mechanism = "arm" | "elevator";
type ArmShape = "point" | "rod";

interface GravityCalculatorProps {
  /** Which mechanism to show first. */
  mechanism?: Mechanism;
}

const G_ACCEL = 9.81;

/** Starting values that match the worked examples on the voltage and torque-current pages. */
const DEFAULTS = {
  arm: { mass: 5, length: 0.4, gear: 100 },
  elevator: { mass: 8, length: 0.02, gear: 10 },
};

/**
 * Computes kG and kA from mechanism geometry, in Volts (voltage mode) and Amps (torque-current mode), using the
 * formulas from the Voltage Control and Torque-Current Control pages.
 */
export const GravityCalculator = ({ mechanism: initial = "arm" }: GravityCalculatorProps) => {
  const [mechanism, setMechanism] = useState<Mechanism>(initial);
  const [motor, setMotor] = useState<MotorId>("x60");
  const [commutation, setCommutation] = useState<Commutation>("foc");
  const [mass, setMass] = useState(DEFAULTS[initial].mass);
  const [length, setLength] = useState(DEFAULTS[initial].length);
  const [gear, setGear] = useState(DEFAULTS[initial].gear);
  const [shape, setShape] = useState<ArmShape>("point");

  const switchMechanism = (m: Mechanism) => {
    setMechanism(m);
    setMass(DEFAULTS[m].mass);
    setLength(DEFAULTS[m].length);
    setGear(DEFAULTS[m].gear);
  };

  const r = useMemo(() => {
    const { kt, r: resistance } = MOTORS[motor][commutation];
    // Torque at the mechanism that gravity applies (arm at horizontal, or elevator at any height).
    const gravityTorque = mass * G_ACCEL * length;
    const kGAmps = gravityTorque / (gear * kt);
    if (mechanism === "arm") {
      // Inertia about the pivot: point mass at the CG, or a uniform rod whose CG is at half its length.
      const inertia = shape === "point" ? mass * length ** 2 : (4 / 3) * mass * length ** 2;
      const kAAmps = (2 * Math.PI * inertia) / (gear * kt);
      return {
        gravityTorque,
        inertia,
        kGAmps,
        kGVolts: kGAmps * resistance,
        kAAmps,
        kAVolts: kAAmps * resistance,
        kAAmpsPerRot: NaN,
        kAVoltsPerRot: NaN,
      };
    }
    const kAAmpsPerMeter = (mass * length) / (gear * kt);
    const kAAmpsPerRot = (2 * Math.PI * mass * length ** 2) / (gear * kt);
    return {
      gravityTorque,
      inertia: NaN,
      kGAmps,
      kGVolts: kGAmps * resistance,
      kAAmps: kAAmpsPerMeter,
      kAVolts: kAAmpsPerMeter * resistance,
      kAAmpsPerRot,
      kAVoltsPerRot: kAAmpsPerRot * resistance,
    };
  }, [mechanism, motor, commutation, mass, length, gear, shape]);

  const isArm = mechanism === "arm";

  return (
    <Widget title="kG and kA calculator">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Mechanism"
          value={mechanism}
          onChange={switchMechanism}
          options={[
            { value: "arm", label: "Arm" },
            { value: "elevator", label: "Elevator" },
          ]}
        />
        {isArm ? (
          <Segmented
            label="Mass distribution (for kA)"
            value={shape}
            onChange={setShape}
            options={[
              { value: "point", label: "Weight at CG" },
              { value: "rod", label: "Uniform rod" },
            ]}
          />
        ) : (
          <div />
        )}
        <MotorPicker
          motor={motor}
          commutation={commutation}
          onMotorChange={setMotor}
          onCommutationChange={setCommutation}
        />
        <Slider
          label={isArm ? "Arm mass" : "Carriage mass (moving)"}
          value={mass}
          min={0.5}
          max={30}
          step={0.5}
          format={(v) => `${v} kg`}
          onChange={setMass}
        />
        <Slider
          label={isArm ? "Pivot to center of gravity" : "Drum radius"}
          value={length}
          min={isArm ? 0.05 : 0.005}
          max={isArm ? 1.2 : 0.06}
          step={isArm ? 0.01 : 0.001}
          format={(v) => (isArm ? `${fmt(v)} m` : `${fmt(v * 1000)} mm`)}
          onChange={setLength}
        />
        <Slider
          label="Gear reduction G"
          value={gear}
          min={1}
          max={isArm ? 250 : 40}
          step={1}
          format={(v) => `${v}:1`}
          onChange={setGear}
        />
        <Readout
          label={isArm ? "Gravity torque at horizontal" : "Gravity torque at the drum"}
          value={fmt(r.gravityTorque)}
          unit="N·m"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fd-border text-left text-xs text-fd-muted-foreground">
              <th className="py-2 pr-4 font-medium">Gain</th>
              <th className="py-2 pr-4 font-medium">Voltage mode</th>
              <th className="py-2 font-medium">Torque-current mode</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr className="border-b border-fd-border">
              <td className="py-2 pr-4 font-sans font-medium">kG</td>
              <td className="py-2 pr-4">{fmt(r.kGVolts)} V</td>
              <td className="py-2">{fmt(r.kGAmps)} A</td>
            </tr>
            <tr className="border-b border-fd-border">
              <td className="py-2 pr-4 font-sans font-medium">
                kA{" "}
                <span className="text-xs text-fd-muted-foreground">
                  {isArm ? "per arm rot/s²" : "per m/s² of carriage"}
                </span>
              </td>
              <td className="py-2 pr-4">{fmt(r.kAVolts)} V</td>
              <td className="py-2">{fmt(r.kAAmps)} A</td>
            </tr>
            {!isArm && (
              <tr>
                <td className="py-2 pr-4 font-sans font-medium">
                  kA <span className="text-xs text-fd-muted-foreground">per drum rot/s²</span>
                </td>
                <td className="py-2 pr-4">{fmt(r.kAVoltsPerRot)} V</td>
                <td className="py-2">{fmt(r.kAAmpsPerRot)} A</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-fd-muted-foreground">
        {isArm ? (
          <>
            kG = m·g·L / (G·k<sub>t</sub>) in Amps. The voltage-mode value is that current times R, the voltage needed
            to push it at zero speed. kA uses an inertia of {fmt(r.inertia)} kg·m² about the pivot.
          </>
        ) : (
          <>
            kG = m·g·r / (G·k<sub>t</sub>) in Amps, the same at every height. Pick the kA row that matches your{" "}
            <code>SensorToMechanismRatio</code> units. The two differ by 2πr, the travel per drum turn.
          </>
        )}
      </p>
      <p className="text-xs text-fd-muted-foreground">
        Starting estimates only. Ignores friction, cables, and the motor&apos;s own rotor inertia. Measured voltage-mode
        values usually come out higher, because a warm motor and the wiring add resistance. Cross-check against SysId or
        the bracketing test.
      </p>
    </Widget>
  );
};
