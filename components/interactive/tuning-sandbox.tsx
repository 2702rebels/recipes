"use client";

import { useMemo, useState } from "react";

import { MOTORS } from "@/lib/motors";
import { simulateStep, type LoopMode } from "@/lib/turret-sim";

import { ActionButton, fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";

interface Gains {
  kS: number;
  kP: number;
  kD: number;
}

interface Preset {
  label: string;
  mode: LoopMode;
  gains: Gains;
}

/** A 20:1 turret on a Kraken X60 (FOC), with friction equivalent to CTRE's kS = 1.25 A example. */
const MOTOR = MOTORS.x60.foc;
const GEAR = 20;
const INERTIA = 0.05;
const FRICTION = 1.25 * GEAR * MOTOR.kt;

const PRESETS: Preset[] = [
  { label: "Voltage, kP only", mode: "voltage", gains: { kS: 0.03, kP: 100, kD: 0 } },
  { label: "Torque, kP only", mode: "torque", gains: { kS: 1.25, kP: 1650, kD: 0 } },
  { label: "Torque, CTRE turret gains", mode: "torque", gains: { kS: 1.25, kP: 1650, kD: 60 } },
  { label: "Torque, too much kD", mode: "torque", gains: { kS: 1.25, kP: 1650, kD: 300 } },
];

const RANGES: Record<LoopMode, { kS: number; kP: [number, number]; kD: number; unit: string }> = {
  voltage: { kS: 0.2, kP: [1, 2000], kD: 20, unit: "V" },
  torque: { kS: 5, kP: [10, 20000], kD: 600, unit: "A" },
};

/**
 * Step-response sandbox for a simulated turret. Compares voltage and torque-current position control, and shows why
 * torque mode needs kD (no back-EMF damping) and where too much kD meets the loop's latency limit.
 */
export const TuningSandbox = () => {
  const [mode, setMode] = useState<LoopMode>("torque");
  const [gains, setGains] = useState<Record<LoopMode, Gains>>({
    voltage: PRESETS[0].gains,
    torque: PRESETS[1].gains,
  });
  const [step, setStep] = useState(0.1);
  const [limit, setLimit] = useState(60);
  const [latencyMs, setLatencyMs] = useState(3);

  const g = gains[mode];
  const range = RANGES[mode];
  const setGain = (key: keyof Gains) => (v: number) =>
    setGains((all) => ({ ...all, [mode]: { ...all[mode], [key]: v } }));

  const applyPreset = (p: Preset) => {
    setMode(p.mode);
    setGains((all) => ({ ...all, [p.mode]: p.gains }));
    setStep(0.1);
    setLimit(60);
    setLatencyMs(3);
  };

  const sim = useMemo(
    () =>
      simulateStep({
        mode,
        ...g,
        step,
        currentLimit: limit,
        latency: latencyMs / 1000,
        supply: 12,
        gear: GEAR,
        inertia: INERTIA,
        friction: FRICTION,
        kt: MOTOR.kt,
        ke: MOTOR.ke,
        r: MOTOR.r,
        duration: 0.6,
      }),
    [mode, g, step, limit, latencyMs]
  );

  const ms = (ys: number[]) => sim.t.map((t, i): [number, number] => [t * 1000, ys[i]]);
  const posMax = Math.max(step * 1.3, ...sim.position) * 1.05;
  const posMin = Math.min(0, ...sim.position) * 1.05;
  const settled = !Number.isNaN(sim.settlingTime);

  return (
    <Widget title="Tuning sandbox: turret step response">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Presets</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <ActionButton
              key={p.label}
              onClick={() => applyPreset(p)}>
              {p.label}
            </ActionButton>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Output family"
          value={mode}
          onChange={setMode}
          options={[
            { value: "voltage", label: "Voltage (V)" },
            { value: "torque", label: "Torque-current (A)" },
          ]}
        />
        <Slider
          label="Step size"
          value={step}
          min={0.01}
          max={0.5}
          step={0.01}
          format={(v) => `${fmt(v)} rot (${fmt(v * 360)}°)`}
          onChange={setStep}
        />
        <Slider
          label="kP"
          value={g.kP}
          min={range.kP[0]}
          max={range.kP[1]}
          log
          format={(v) => `${fmt(v)} ${range.unit}/rot`}
          onChange={setGain("kP")}
        />
        <Slider
          label="kD"
          value={g.kD}
          min={0}
          max={range.kD}
          step={range.kD / 200}
          format={(v) => `${fmt(v)} ${range.unit}/(rot/s)`}
          onChange={setGain("kD")}
        />
        <Slider
          label="kS (sign of error)"
          value={g.kS}
          min={0}
          max={range.kS}
          step={range.kS / 100}
          format={(v) => `${fmt(v)} ${range.unit}`}
          onChange={setGain("kS")}
        />
        <Slider
          label="Stator current limit"
          value={limit}
          min={10}
          max={120}
          step={5}
          format={(v) => `${v} A`}
          onChange={setLimit}
        />
        <Slider
          label="Loop latency"
          value={latencyMs}
          min={0}
          max={20}
          step={1}
          format={(v) => `${v} ms`}
          onChange={setLatencyMs}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Readout
          label="Overshoot"
          value={fmt(sim.overshoot * 100, 2)}
          unit="%"
        />
        <Readout
          label="Settles within 2%"
          value={settled ? fmt(sim.settlingTime * 1000) : "never"}
          unit={settled ? "ms" : undefined}
        />
        <Readout
          label="Error at 600 ms"
          value={fmt(sim.finalError * 360, 2)}
          unit="°"
        />
        <Readout
          label="Peak stator current"
          value={fmt(sim.peakCurrent)}
          unit="A"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Position</div>
        <LinePlot
          series={[{ label: "Turret position", color: "var(--color-plot-1)", points: ms(sim.position) }]}
          markers={[{ y: step, label: "setpoint", color: "var(--color-plot-2)" }]}
          xMax={600}
          yMin={posMin}
          yMax={posMax}
          xLabel="time (ms)"
          yLabel="position (rot)"
          ariaLabel="Turret position over time after a step in setpoint"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Stator (motor) current</div>
        <LinePlot
          series={[{ label: "Stator current", color: "var(--color-plot-2)", points: ms(sim.current) }]}
          markers={[
            { y: limit, label: "stator limit" },
            { y: -limit, label: "−stator limit" },
          ]}
          xMax={600}
          yMin={-limit * 1.15}
          yMax={limit * 1.15}
          xLabel="time (ms)"
          yLabel="stator current (A)"
          ariaLabel="Stator current over time"
        />
      </div>

      <p className="text-sm text-fd-muted-foreground">
        Start with <strong className="text-fd-foreground">Voltage, kP only</strong>: back-EMF damps the move, so it
        settles without kD. Switch to <strong className="text-fd-foreground">Torque, kP only</strong> and the same kind
        of tune rings, because torque mode has no back-EMF damping. CTRE&apos;s gains add kD and settle cleanly. Push kD
        much higher and the loop starts to chatter: that is the latency limit from step 6 of the turret procedure.
      </p>
      <p className="text-xs text-fd-muted-foreground">
        A 20:1 turret on a Kraken X60 (FOC), {INERTIA} kg·m², with friction equal to kS = 1.25 A. Runs the loop at 1 kHz
        with an ideal current loop, a 12 V supply, and the chosen output delay. The current limit and the plotted
        current are stator (motor winding) current, set by <code>StatorCurrentLimit</code>. In torque mode{" "}
        <code>PeakForwardTorqueCurrent</code> caps it the same way. Supply (battery) current is not shown. Real
        mechanisms add backlash, compliance, and sensor noise, so use the results as intuition, not as gains to copy.
      </p>
    </Widget>
  );
};
