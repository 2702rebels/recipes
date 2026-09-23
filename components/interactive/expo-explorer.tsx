"use client";

import { useMemo, useState } from "react";

import { MOTORS, type Commutation, type MotorId } from "@/lib/motors";

import { fmt, MotorPicker, Readout, Slider, Widget } from "./controls";
import { LinePlot, type PlotBand } from "./plot";

/** Values from the numerical check on the Motion Magic Expo page. */
const EXAMPLE = { motor: "x60" as MotorId, commutation: "foc" as Commutation, gear: 50, inertia: 0.25, supply: 12 };

const SAMPLES = 240;

/**
 * Interactive explorer for Motion Magic Expo: shows the profile the motor model produces, the configs to enter, and
 * how a hand-picked trapezoidal acceleration compares with what the motor can actually deliver.
 */
export const ExpoExplorer = () => {
  const [motor, setMotor] = useState<MotorId>(EXAMPLE.motor);
  const [commutation, setCommutation] = useState<Commutation>(EXAMPLE.commutation);
  const [gear, setGear] = useState(EXAMPLE.gear);
  const [inertia, setInertia] = useState(EXAMPLE.inertia);
  const [supply, setSupply] = useState(EXAMPLE.supply);
  const [trapAccel, setTrapAccel] = useState(200);
  const [cruiseCap, setCruiseCap] = useState(0);

  const model = useMemo(() => {
    const { kt, ke, r } = MOTORS[motor][commutation];
    const jRotor = inertia / (gear * gear);
    const expoKV = 2 * Math.PI * ke * gear;
    const expoKA = (2 * Math.PI * r * jRotor * gear) / kt;
    const vMax = supply / expoKV;
    const aMax = supply / expoKA;
    const tau = expoKA / expoKV;
    const cap = cruiseCap > 0 && cruiseCap < vMax ? cruiseCap : Infinity;
    const trapCruise = Number.isFinite(cap) ? cap : vMax;

    const tEnd = Math.min(Math.max(5 * tau, (1.3 * trapCruise) / trapAccel), 40 * tau);
    const ts = Array.from({ length: SAMPLES + 1 }, (_, i) => (i / SAMPLES) * tEnd);

    const envelope = (t: number) => vMax * (1 - Math.exp(-t / tau));
    const expoV = (t: number) => Math.min(envelope(t), cap);
    const expoA = (t: number) => (envelope(t) < cap ? aMax * Math.exp(-t / tau) : 0);
    const trapV = (t: number) => Math.min(trapAccel * t, trapCruise);
    const trapA = (t: number) => (trapAccel * t < trapCruise ? trapAccel : 0);

    // Where the trapezoid asks for a speed above the full-voltage curve, the motor cannot follow.
    const over = ts.filter((t) => trapV(t) > envelope(t) + 1e-9);
    const band: PlotBand[] =
      over.length > 1
        ? [
            {
              label: "Trapezoid asks for more than the motor can give",
              color: "var(--color-plot-danger)",
              polygon: [
                ...over.map((t): [number, number] => [t * 1000, trapV(t)]),
                ...over.toReversed().map((t): [number, number] => [t * 1000, envelope(t)]),
              ],
            },
          ]
        : [];

    const ms = (f: (t: number) => number) => ts.map((t): [number, number] => [t * 1000, f(t)]);
    return {
      expoKV,
      expoKA,
      vMax,
      aMax,
      tau,
      tEnd,
      band,
      firstOver: over[0],
      trapReachesCruise: trapCruise / trapAccel,
      expoReaches95: Number.isFinite(cap) ? -tau * Math.log(1 - (0.95 * cap) / vMax) : 3 * tau,
      velocity: [
        { label: "Motion Magic Expo", color: "var(--color-plot-1)", points: ms(expoV) },
        { label: "Trapezoid", color: "var(--color-plot-2)", points: ms(trapV) },
        { label: "Full-voltage limit", color: "var(--color-plot-muted)", points: ms(envelope), dashed: true },
      ],
      acceleration: [
        { label: "Motion Magic Expo", color: "var(--color-plot-1)", points: ms(expoA) },
        { label: "Trapezoid", color: "var(--color-plot-2)", points: ms(trapA) },
      ],
      yMaxV: vMax * 1.1,
      yMaxA: Math.max(aMax, trapAccel) * 1.1,
    };
  }, [motor, commutation, gear, inertia, supply, trapAccel, cruiseCap]);

  const loadExample = () => {
    setMotor(EXAMPLE.motor);
    setCommutation(EXAMPLE.commutation);
    setGear(EXAMPLE.gear);
    setInertia(EXAMPLE.inertia);
    setSupply(EXAMPLE.supply);
    setTrapAccel(200);
    setCruiseCap(0);
  };

  return (
    <Widget title="Motion Magic Expo explorer">
      <div className="grid gap-4 sm:grid-cols-2">
        <MotorPicker
          motor={motor}
          commutation={commutation}
          onMotorChange={setMotor}
          onCommutationChange={setCommutation}
        />
        <Slider
          label="Gear reduction G"
          value={gear}
          min={1}
          max={150}
          step={1}
          format={(v) => `${v}:1`}
          onChange={setGear}
        />
        <Slider
          label="Mechanism inertia"
          value={inertia}
          min={0.001}
          max={20}
          log
          format={(v) => `${fmt(v, 2)} kg·m²`}
          onChange={setInertia}
        />
        <Slider
          label="Supply voltage"
          value={supply}
          min={9}
          max={13}
          step={0.1}
          format={(v) => `${v.toFixed(1)} V`}
          onChange={setSupply}
        />
        <Slider
          label="Cruise velocity cap (0 = none)"
          value={Math.min(cruiseCap, model.vMax)}
          min={0}
          max={Number(model.vMax.toPrecision(3))}
          step={Number((model.vMax / 100).toPrecision(2))}
          format={(v) => (v === 0 ? "none" : `${fmt(v)} rot/s`)}
          onChange={setCruiseCap}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Readout
          label="MotionMagicExpo_kV"
          value={fmt(model.expoKV)}
          unit="V/(rot/s)"
          emphasis
        />
        <Readout
          label="MotionMagicExpo_kA"
          value={fmt(model.expoKA)}
          unit="V/(rot/s²)"
          emphasis
        />
        <Readout
          label="Time constant τ"
          value={fmt(model.tau * 1000)}
          unit="ms"
        />
        <Readout
          label="Top speed"
          value={fmt(model.vMax)}
          unit={`rot/s (${fmt(model.vMax * 60)} RPM)`}
        />
        <Readout
          label="Starting acceleration"
          value={fmt(model.aMax)}
          unit="rot/s²"
        />
        <Readout
          label="Reaches 95% of top speed"
          value={fmt(model.expoReaches95 * 1000)}
          unit="ms"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Velocity from rest</div>
        <LinePlot
          series={model.velocity}
          bands={model.band}
          xMax={model.tEnd * 1000}
          yMax={model.yMaxV}
          xLabel="time (ms)"
          yLabel="velocity (rot/s)"
          ariaLabel="Velocity over time for the Expo profile, a trapezoidal profile, and the motor's full-voltage limit"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Acceleration</div>
        <LinePlot
          series={model.acceleration}
          xMax={model.tEnd * 1000}
          yMax={model.yMaxA}
          xLabel="time (ms)"
          yLabel="acceleration (rot/s²)"
          ariaLabel="Acceleration over time for the Expo profile and a trapezoidal profile"
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-fd-border pt-4">
        <Slider
          label="Compare: trapezoidal acceleration"
          value={trapAccel}
          min={1}
          max={5000}
          log
          format={(v) => `${fmt(v)} rot/s²`}
          onChange={setTrapAccel}
        />
        <p className="text-sm text-fd-muted-foreground">
          {model.firstOver !== undefined ? (
            <>
              From about <strong className="text-fd-foreground">{fmt(model.firstOver * 1000)} ms</strong> the trapezoid
              asks for more speed than the motor can reach even at full voltage. The mechanism falls behind and the PID
              has to absorb the error.
            </>
          ) : (
            <>
              The trapezoid stays within what the motor can deliver, but it reaches cruise at{" "}
              <strong className="text-fd-foreground">{fmt(model.trapReachesCruise * 1000)} ms</strong>, against{" "}
              {fmt(model.expoReaches95 * 1000)} ms for Expo to reach 95% of its top speed.
            </>
          )}
        </p>
        <p className="text-xs text-fd-muted-foreground">
          Assumes no friction, gravity, or current limits, and ignores the motor&apos;s own rotor inertia. Stator and
          torque-current limits cap acceleration further. The Expo configs are always in Volts, whatever request type
          you use.{" "}
          <button
            type="button"
            onClick={loadExample}
            className="text-fd-primary underline underline-offset-2">
            Reset to the page example
          </button>
        </p>
      </div>
    </Widget>
  );
};
