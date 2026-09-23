"use client";

import { useEffect, useRef, useState } from "react";

import { MOTORS } from "@/lib/motors";

import { ActionButton, fmt, Readout, Slider, Widget } from "./controls";

/** CTRE's worked example: a 35:1 arm with kG = 21 A and kS = 3.5 A. */
const EXAMPLE = { kG: 21, kS: 3.5 };
const GEAR = 35;
const KT = MOTORS.x60.foc.kt;
const LENGTH = 0.5;
const G_ACCEL = 9.81;
const LIMIT = (80 * Math.PI) / 180;
const DT = 0.001;

type Outcome = "held" | "holds" | "falls" | "rises";

const OUTCOME_TEXT: Record<Outcome, string> = {
  held: "You are holding the arm at horizontal.",
  holds: "Released. The arm stays put.",
  falls: "Released. The arm falls.",
  rises: "Released. The arm rises.",
};

/**
 * A simulated arm with hidden kG and kS. The reader finds kG − kS (smallest current that holds) and kG + kS (largest
 * current that does not lift) with PID off, then checks the midpoint and half-width against the true values.
 */
export const BracketingSimulator = () => {
  const [truth, setTruth] = useState(EXAMPLE);
  const [kG, setKG] = useState(10);
  const [outcome, setOutcome] = useState<Outcome>("held");
  const [angle, setAngle] = useState(0);
  const [low, setLow] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const state = useRef({ theta: 0, omega: 0 });

  const mass = (truth.kG * GEAR * KT) / (G_ACCEL * LENGTH);
  const inertia = mass * LENGTH ** 2;

  // Animate the released arm. Motor torque follows kG·cos(θ) (Arm_Cosine), so it scales with gravity at every angle.
  useEffect(() => {
    if (outcome === "held") return;
    let frame = 0;
    let last = performance.now();
    const staticFriction = truth.kS * GEAR * KT;
    const step = (now: number) => {
      const s = state.current;
      let remaining = Math.min((now - last) / 1000, 0.05);
      last = now;
      while (remaining > 0) {
        const drive = GEAR * KT * (kG - truth.kG) * Math.cos(s.theta);
        let torque: number;
        if (Math.abs(s.omega) < 1e-4 && Math.abs(drive) <= staticFriction) {
          s.omega = 0;
          torque = 0;
        } else {
          const dir = Math.abs(s.omega) > 1e-4 ? Math.sign(s.omega) : Math.sign(drive);
          torque = drive - 0.8 * staticFriction * dir;
        }
        s.omega += (torque / inertia) * DT;
        s.theta += s.omega * DT;
        if (Math.abs(s.theta) >= LIMIT) {
          s.theta = Math.sign(s.theta) * LIMIT;
          s.omega = 0;
        }
        remaining -= DT;
      }
      setAngle(s.theta);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [outcome, kG, truth, inertia]);

  const release = () => {
    state.current = { theta: 0, omega: 0 };
    const diff = kG - truth.kG;
    setOutcome(diff < -truth.kS ? "falls" : diff > truth.kS ? "rises" : "holds");
  };

  const hold = () => {
    state.current = { theta: 0, omega: 0 };
    setAngle(0);
    setOutcome("held");
  };

  const changeKG = (v: number) => {
    setKG(v);
    hold();
  };

  const newArm = () => {
    const nextKG = Math.round((8 + Math.random() * 22) * 10) / 10;
    const nextKS = Math.round((1 + Math.random() * 4) * 10) / 10;
    setTruth({ kG: nextKG, kS: nextKS });
    setLow(null);
    setHigh(null);
    setRevealed(false);
    hold();
  };

  const estimate = low !== null && high !== null && high >= low ? { kG: (high + low) / 2, kS: (high - low) / 2 } : null;

  // Arm drawing: pivot on the left, positive angle is up.
  const px = 70;
  const py = 110;
  const len = 190;
  const ex = px + len * Math.cos(angle);
  const ey = py - len * Math.sin(angle);

  return (
    <Widget title="Bracketing simulator">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_1.2fr]">
        <svg
          viewBox="0 0 300 220"
          role="img"
          aria-label={`Arm at ${Math.round((angle * 180) / Math.PI)} degrees from horizontal`}
          className="h-auto w-full">
          <line
            x1={px}
            x2={px + len + 20}
            y1={py}
            y2={py}
            className="stroke-fd-border"
            strokeDasharray="4 4"
          />
          {/* Below the line and past the weight, where the arm never passes. */}
          <text
            x={px + len + 20}
            y={py + 32}
            textAnchor="end"
            className="fill-fd-muted-foreground text-[10px]">
            horizontal
          </text>
          <line
            x1={px}
            y1={py}
            x2={ex}
            y2={ey}
            stroke="var(--color-plot-1)"
            strokeWidth={8}
            strokeLinecap="round"
          />
          <circle
            cx={ex}
            cy={ey}
            r={14}
            fill="var(--color-plot-2)"
          />
          <circle
            cx={px}
            cy={py}
            r={9}
            className="fill-fd-card stroke-fd-muted-foreground"
            strokeWidth={3}
          />
          {outcome === "held" && (
            <text
              x={ex}
              y={ey - 24}
              textAnchor="middle"
              className="fill-fd-muted-foreground text-[11px]">
              held by hand
            </text>
          )}
        </svg>

        <div className="flex flex-col gap-4">
          <Slider
            label="kG (all other gains zero)"
            value={kG}
            min={0}
            max={40}
            step={0.25}
            format={(v) => `${v.toFixed(2)} A`}
            onChange={changeKG}
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton
              primary
              onClick={outcome === "held" ? release : hold}>
              {outcome === "held" ? "Let go" : "Hold at horizontal again"}
            </ActionButton>
          </div>
          <p className="text-sm font-medium">{OUTCOME_TEXT[outcome]}</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={outcome !== "holds"}
              onClick={() => setLow(kG)}>
              Record as lower bound
            </ActionButton>
            <ActionButton
              disabled={outcome !== "holds"}
              onClick={() => setHigh(kG)}>
              Record as upper bound
            </ActionButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Readout
          label="kG_low (smallest that holds)"
          value={low === null ? "—" : fmt(low)}
          unit="A"
        />
        <Readout
          label="kG_high (largest that doesn't rise)"
          value={high === null ? "—" : fmt(high)}
          unit="A"
        />
        <Readout
          label="Your kG = midpoint"
          value={estimate ? fmt(estimate.kG) : "—"}
          unit="A"
          emphasis
        />
        <Readout
          label="Your kS = half the gap"
          value={estimate ? fmt(estimate.kS) : "—"}
          unit="A"
          emphasis
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide true values" : "Reveal true values"}
        </ActionButton>
        <ActionButton onClick={newArm}>New random arm</ActionButton>
        {revealed && (
          <span className="text-sm text-fd-muted-foreground">
            True kG = <strong className="text-fd-foreground">{fmt(truth.kG)} A</strong>, kS ={" "}
            <strong className="text-fd-foreground">{fmt(truth.kS)} A</strong>. The bounds are {fmt(truth.kG - truth.kS)}{" "}
            A and {fmt(truth.kG + truth.kS)} A.
          </span>
        )}
      </div>

      <p className="text-xs text-fd-muted-foreground">
        A {GEAR}:1 arm on a Kraken X60 (FOC), started at horizontal each time. Motor output follows kG·cos(θ), as with
        GravityType = Arm_Cosine. Friction is modeled as a static threshold (kS) with slightly lower sliding friction.
        The first arm uses CTRE&apos;s worked example.
      </p>
    </Widget>
  );
};
