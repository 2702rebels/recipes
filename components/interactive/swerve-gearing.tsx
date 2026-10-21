"use client";

import { useState } from "react";

import { MOTORS, type Commutation, type MotorId } from "@/lib/motors";
import {
  accelerationAt,
  freeSpeed,
  simulateSprint,
  slipCurrent,
  timeToDistance,
  type DriveGearing,
  type Sprint,
} from "@/lib/swerve";

import { fmt, MotorPicker, Readout, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil } from "./vision-views";

const DURATION = 2.5;
const SPRINT = 5;
const DEFAULT_RATIO = 6.75;
const INCH = 0.0254;

/**
 * How the drive gear ratio, wheel size, robot mass, tread friction, and stator current limit set a swerve robot's top
 * speed, its acceleration, and the current at which the wheels slip. Plots a full-throttle sprint from rest.
 */
export const SwerveGearing = () => {
  const [motor, setMotor] = useState<MotorId>("x60");
  const [commutation, setCommutation] = useState<Commutation>("foc");
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [wheelIn, setWheelIn] = useState(4);
  const [mass, setMass] = useState(65);
  const [mu, setMu] = useState(1.1);
  const [statorLimit, setStatorLimit] = useState(60);

  const gearing: DriveGearing = {
    motor: MOTORS[motor][commutation],
    ratio,
    wheelRadius: (wheelIn * INCH) / 2,
    mass,
    mu,
    statorLimit,
  };
  const reference: DriveGearing = { ...gearing, ratio: DEFAULT_RATIO };
  const sprint = simulateSprint(gearing, DURATION);
  const refSprint = simulateSprint(reference, DURATION);

  const top = freeSpeed(gearing);
  const slip = slipCurrent(gearing);
  const start = accelerationAt(gearing, 0);
  const t5 = timeToDistance(sprint, SPRINT);
  // Every 10th step is plenty for the plot.
  const toPoints = (s: Sprint) => s.t.flatMap((t, i): [number, number][] => (i % 10 === 0 ? [[t, s.v[i]]] : []));
  const yMax = niceCeil(Math.max(top, freeSpeed(reference)) * 1.05);

  return (
    <Widget title="Drive gearing: top speed vs. acceleration">
      <div className="grid gap-4 sm:grid-cols-2">
        <MotorPicker
          motor={motor}
          commutation={commutation}
          onMotorChange={setMotor}
          onCommutationChange={setCommutation}
        />
        <Slider
          label="Drive gear ratio"
          value={ratio}
          min={4}
          max={9}
          step={0.05}
          format={(v) => `${fmt(v)}:1`}
          onChange={setRatio}
        />
        <Slider
          label="Wheel diameter"
          value={wheelIn}
          min={3}
          max={5}
          step={0.05}
          format={(v) => `${fmt(v)} in`}
          onChange={setWheelIn}
        />
        <Slider
          label="Robot mass (with bumpers and battery)"
          value={mass}
          min={40}
          max={70}
          step={1}
          format={(v) => `${v} kg`}
          onChange={setMass}
        />
        <Slider
          label="Tread friction coefficient μ"
          value={mu}
          min={0.6}
          max={1.4}
          step={0.05}
          format={(v) => fmt(v)}
          onChange={setMu}
        />
        <Slider
          label="Drive stator current limit, per motor"
          value={statorLimit}
          min={20}
          max={120}
          step={5}
          format={(v) => `${v} A`}
          onChange={setStatorLimit}
        />
      </div>

      <LinePlot
        series={[
          { label: `${fmt(ratio)}:1`, points: toPoints(sprint), color: "var(--color-plot-1)" },
          ...(Math.abs(ratio - DEFAULT_RATIO) > 1e-9
            ? [
                {
                  label: `${DEFAULT_RATIO}:1, for comparison`,
                  points: toPoints(refSprint),
                  color: "var(--color-plot-muted)",
                  dashed: true,
                },
              ]
            : []),
        ]}
        markers={[
          { y: top, label: "Free speed" },
          ...(Number.isFinite(t5) ? [{ x: t5, label: `${SPRINT} m`, color: "var(--color-plot-2)" }] : []),
        ]}
        xMax={DURATION}
        yMax={yMax}
        xLabel="Time from a standing start (s)"
        yLabel="Robot speed (m/s)"
        ariaLabel="Robot speed against time for a full-throttle sprint from rest"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Free speed"
          value={fmt(top)}
          unit="m/s"
        />
        <Readout
          label="Slip current (stator)"
          value={fmt(slip)}
          unit="A"
          emphasis
        />
        <Readout
          label={statorLimit >= slip ? "Start: limited by traction" : "Start: limited by stator current"}
          value={fmt(start)}
          unit="m/s²"
        />
        <Readout
          label={`Time to drive ${SPRINT} m`}
          value={fmt(t5)}
          unit="s"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        A full-throttle sprint in a straight line, with all four modules pushing. Each motor gets the stator current
        limit, or less once back-EMF leaves too little voltage to push it. The slip current is the stator current at
        which the treads break loose, with the weight shared equally by the four wheels. A limit above it spins the
        wheels, and the model then caps the acceleration at μg. The model holds the battery at 12 V and ignores gear
        losses, rolling drag, and battery sag, so a real robot is slower and reaches about 80 to 90% of the free speed.
      </p>
    </Widget>
  );
};
