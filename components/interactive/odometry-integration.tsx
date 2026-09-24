"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  simulateIntegration,
  type IntegrationMethod,
  type IntegrationMotion,
  type IntegrationResult,
} from "@/lib/localization-sim";

import { ActionButton, fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil, px } from "./vision-views";

const DISTANCE = 5;
/** Real time for one playback of the drive (ms), whatever the drive's own duration. */
const PLAYBACK_MS = 5000;
/** Side of the drawn robot (m), to scale. */
const ROBOT = 0.6;

const METHODS: { id: IntegrationMethod; label: string; color: string }[] = [
  { id: "euler", label: "Heading at start of step", color: "var(--color-plot-2)" },
  { id: "exp", label: "Pose exponential (WPILib)", color: "var(--color-plot-1)" },
];

/** Where a method's robot is drawn: the truth plus `magnify` times the method's error. */
const shown = (sim: IntegrationResult, m: IntegrationMethod, i: number, magnify: number): [number, number] => {
  const [tx, ty] = sim.truth[i];
  const [x, y] = sim.position[m][i];
  return [tx + magnify * (x - tx), ty + magnify * (y - ty)];
};

/** A square robot at `(x, y)` in screen pixels, turned by `heading` (field radians), with a bar on its front edge. */
const Robot = ({
  x,
  y,
  heading,
  size,
  color,
  filled,
}: {
  x: number;
  y: number;
  heading: number;
  size: number;
  color: string;
  filled?: boolean;
}) => (
  // Screen y points down, so a counterclockwise field heading is a negative SVG rotation.
  <g transform={`translate(${px(x)} ${px(y)}) rotate(${px((-heading * 180) / Math.PI)})`}>
    <rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      rx={size * 0.12}
      fill={filled ? color : "none"}
      fillOpacity={filled ? 0.25 : undefined}
      stroke={color}
      strokeWidth={2}
    />
    <line
      x1={size / 2 - 3}
      y1={-size * 0.3}
      x2={size / 2 - 3}
      y2={size * 0.3}
      stroke={color}
      strokeWidth={4}
      strokeLinecap="round"
    />
  </g>
);

/** Top-down view of the true robot and the two odometry estimates, at sample `i`, with their trails. */
const FieldView = ({ sim, i, magnify }: { sim: IntegrationResult; i: number; magnify: number }) => {
  // Fit the whole drive, so the view doesn't move while it plays.
  const all = [
    ...sim.truth.map(([x, y]): [number, number] => [x, y]),
    ...METHODS.flatMap((m) => sim.truth.map((_, j) => shown(sim, m.id, j, magnify))),
  ];
  const pad = ROBOT;
  let minX = Math.min(...all.map((p) => p[0])) - pad;
  let maxX = Math.max(...all.map((p) => p[0])) + pad;
  let minY = Math.min(...all.map((p) => p[1])) - pad;
  let maxY = Math.max(...all.map((p) => p[1])) + pad;
  // Keep a sensible minimum size in each direction, centered on the drive.
  const grow = (lo: number, hi: number, min: number): [number, number] => {
    const extra = Math.max(0, min - (hi - lo)) / 2;
    return [lo - extra, hi + extra];
  };
  [minX, maxX] = grow(minX, maxX, 3);
  [minY, maxY] = grow(minY, maxY, 1.6);
  const width = 640;
  const k = Math.min(width / (maxX - minX), 300 / (maxY - minY));
  const w = (maxX - minX) * k;
  const h = (maxY - minY) * k;
  const sx = (x: number) => (x - minX) * k;
  const sy = (y: number) => (maxY - y) * k;
  const line = (pts: [number, number][]) =>
    pts.map(([x, y], j) => `${j ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");

  const [tx, ty, heading] = sim.truth[i];
  const [ex, ey] = shown(sim, "euler", i, magnify);
  const error = sim.error.euler[i];
  // Room for about 60 px of label to the left of the robots.
  const labelLeft = Math.min(sx(tx), sx(ex)) - (ROBOT * k) / 2 > 70;
  const gridX: number[] = [];
  for (let g = Math.ceil(minX); g <= maxX; g++) gridX.push(g);
  const gridY: number[] = [];
  for (let g = Math.ceil(minY); g <= maxY; g++) gridY.push(g);

  return (
    <svg
      viewBox={`0 0 ${px(w)} ${px(h)}`}
      role="img"
      aria-label="Top-down view of the true robot and the robot as each odometry method places it"
      // Never wider than drawn, so a tall view (the circle) doesn't grow past about 300 px high.
      style={{ maxWidth: `${px(w)}px` }}
      className="mx-auto h-auto w-full rounded-lg border border-fd-border">
      {gridX.map((g) => (
        <line
          key={`x${g}`}
          x1={px(sx(g))}
          x2={px(sx(g))}
          y1={0}
          y2={px(h)}
          className="stroke-fd-border"
        />
      ))}
      {gridY.map((g) => (
        <line
          key={`y${g}`}
          x1={0}
          x2={px(w)}
          y1={px(sy(g))}
          y2={px(sy(g))}
          className="stroke-fd-border"
        />
      ))}
      <path
        d={line(sim.truth.slice(0, i + 1).map(([x, y]): [number, number] => [x, y]))}
        fill="none"
        stroke="var(--color-plot-muted)"
        strokeOpacity={0.5}
        strokeWidth={7}
        strokeLinecap="round"
      />
      {METHODS.map((m) => (
        <path
          key={m.id}
          d={line(sim.truth.slice(0, i + 1).map((_, j) => shown(sim, m.id, j, magnify)))}
          fill="none"
          stroke={m.color}
          strokeWidth={2}
        />
      ))}
      <Robot
        x={sx(tx)}
        y={sy(ty)}
        heading={heading}
        size={ROBOT * k}
        color="var(--color-plot-muted)"
        filled
      />
      {METHODS.map((m) => {
        const [x, y] = shown(sim, m.id, i, magnify);
        return (
          <Robot
            key={m.id}
            x={sx(x)}
            y={sy(y)}
            heading={heading}
            size={ROBOT * k}
            color={m.color}
          />
        );
      })}
      {/* The gap between the true robot and the start-heading estimate. */}
      {error > 0.005 && (
        <g>
          <line
            x1={px(sx(tx))}
            y1={px(sy(ty))}
            x2={px(sx(ex))}
            y2={px(sy(ey))}
            stroke="var(--color-plot-2)"
            strokeWidth={2}
          />
          {/* Beside the robots, on the left unless that runs off the view, so it doesn't cover them. */}
          <text
            x={px(
              labelLeft
                ? Math.min(sx(tx), sx(ex)) - (ROBOT * k) / 2 - 8
                : Math.max(sx(tx), sx(ex)) + (ROBOT * k) / 2 + 8
            )}
            y={px((sy(ty) + sy(ey)) / 2)}
            textAnchor={labelLeft ? "end" : "start"}
            dominantBaseline="middle"
            fill="var(--color-plot-2)"
            className="text-sm font-semibold">
            {fmt(error * 100, 2)} cm
          </text>
        </g>
      )}
    </svg>
  );
};

/**
 * Compares two ways to turn each loop's robot-relative movement into a field position: rotating it by the heading at
 * the start of the step, and the pose exponential that WPILib uses. Encoders and gyro are perfect, so all the
 * error comes from the integration method and the update rate. An animated top-down view shows where each method
 * places the robot.
 */
export const OdometryIntegration = () => {
  const [motion, setMotion] = useState<IntegrationMotion>("spin");
  const [speed, setSpeed] = useState(4);
  const [spin, setSpin] = useState(360);
  const [rate, setRate] = useState<"50" | "100" | "250">("50");
  const [magnify, setMagnify] = useState<"1" | "10">("1");
  // Playback position from 0 (start of the drive) to 1 (end). Starts at the end, so the whole drive shows at first.
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);

  const sim = useMemo(
    () =>
      simulateIntegration({
        motion,
        speed,
        spinRate: (spin * Math.PI) / 180,
        rateHz: Number(rate),
        distance: DISTANCE,
      }),
    [motion, speed, spin, rate]
  );

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, progressRef.current + (now - last) / PLAYBACK_MS);
      last = now;
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const seek = (v: number) => {
    setPlaying(false);
    progressRef.current = v;
    setProgress(v);
  };
  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progressRef.current >= 1) seek(0);
    setPlaying(true);
  };

  const last = sim.distance.length - 1;
  const i = Math.round(progress * last);
  const duration = sim.t[last];
  const toCm = (e: number[]) => sim.distance.map((d, j): [number, number] => [d, e[j] * 100]);
  const yMax = niceCeil(Math.max(0.5, ...sim.error.euler.map((e) => e * 100)));

  return (
    <Widget title="Odometry integration: same wheels, two answers">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Motion"
          value={motion}
          onChange={setMotion}
          options={[
            { value: "spin", label: "Straight line, spinning" },
            { value: "arc", label: "Circle" },
          ]}
        />
        <Segmented
          label="Odometry rate"
          value={rate}
          onChange={setRate}
          options={[
            { value: "50", label: "50 Hz" },
            { value: "100", label: "100 Hz" },
            { value: "250", label: "250 Hz" },
          ]}
        />
        <Slider
          label="Speed"
          value={speed}
          min={1}
          max={5}
          step={0.5}
          format={(v) => `${fmt(v)} m/s`}
          onChange={setSpeed}
        />
        <Slider
          label="Turn rate"
          value={spin}
          min={0}
          max={720}
          step={15}
          format={(v) => `${v}°/s`}
          onChange={setSpin}
        />
      </div>

      <div className="flex flex-col gap-3">
        <FieldView
          sim={sim}
          i={i}
          magnify={Number(magnify)}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-sm border-2"
              style={{
                borderColor: "var(--color-plot-muted)",
                background: "color-mix(in oklab, var(--color-plot-muted) 25%, transparent)",
              }}
            />
            True robot
          </span>
          {METHODS.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-sm border-2"
                style={{ borderColor: m.color }}
              />
              {m.label}
            </span>
          ))}
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_auto]">
          <ActionButton
            primary
            onClick={play}>
            {playing ? "Pause" : progress >= 1 ? "Replay" : "Play"}
          </ActionButton>
          <Slider
            label="Time"
            value={progress * duration}
            min={0}
            max={duration}
            step={duration / 200}
            format={(v) => `${fmt(v, 2)} s of ${fmt(duration, 2)} s`}
            onChange={(v) => seek(v / duration)}
          />
          <Segmented
            label="Errors drawn"
            value={magnify}
            onChange={setMagnify}
            options={[
              { value: "1", label: "To scale" },
              { value: "10", label: "×10" },
            ]}
          />
        </div>
        <p className="text-xs text-fd-muted-foreground">
          Each robot sits where its method thinks the robot is. Both share the true heading, from the perfect gyro. The
          orange line and label give the start-heading method&apos;s real error. The drive takes {fmt(duration, 2)} s
          and plays back over {PLAYBACK_MS / 1000} s. The robot is drawn to scale ({ROBOT} m), with a bar on its front
          edge.
          {magnify === "10" && " Errors are drawn 10 times larger than they are."}
        </p>
      </div>

      <LinePlot
        series={METHODS.map((m) => ({
          label: m.label,
          points: toCm(sim.error[m.id]),
          color: m.color,
        }))}
        markers={progress < 1 ? [{ x: sim.distance[i] }] : []}
        xMax={DISTANCE}
        yMax={yMax}
        xLabel="Distance driven (m)"
        yLabel="Position error (cm)"
        ariaLabel="Odometry position error against distance for two integration methods"
      />

      <div className="grid grid-cols-2 gap-3">
        <Readout
          label="Start of step, after 5 m"
          value={fmt(sim.error.euler[last] * 100)}
          unit="cm"
        />
        <Readout
          label="Pose exponential, after 5 m"
          value={fmt(sim.error.exp[last] < 1e-9 ? 0 : sim.error.exp[last] * 100, 2)}
          unit="cm"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Model: perfect encoders and gyro, and no wheel slip. Each step, the odometry gets the robot-relative distance
        the wheels rolled and the exact heading change. It ignores how swerve modules steer during a step.
      </p>
    </Widget>
  );
};
