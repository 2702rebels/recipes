"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { simulateSkew, type SkewPath } from "@/lib/swerve";

import { ActionButton, fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil, px } from "./vision-views";

const DISTANCE = 4;
/** Real time for one playback of the drive (ms). */
const PLAYBACK_MS = 4000;
/** Side of the drawn robot frame (m), to scale. */
const ROBOT = 0.75;

const PATHS: { id: "plain" | "discretized"; label: string; color: string }[] = [
  { id: "plain", label: "Not discretized", color: "var(--color-plot-2)" },
  { id: "discretized", label: "Discretized", color: "var(--color-plot-1)" },
];

/** A square robot at `(x, y)` in screen pixels, turned by `heading` (field radians), with a bar on its front edge. */
const Robot = ({
  x,
  y,
  heading,
  size,
  color,
  opacity = 1,
}: {
  x: number;
  y: number;
  heading: number;
  size: number;
  color: string;
  opacity?: number;
}) => (
  // Screen y points down, so a counterclockwise heading is a negative SVG rotation.
  <g
    transform={`translate(${px(x)} ${px(y)}) rotate(${px((-heading * 180) / Math.PI)})`}
    opacity={opacity}>
    <rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      rx={size * 0.12}
      fill="none"
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

/** Top-down view of the requested line and the two paths, with each robot at sample `i`. */
const FieldView = ({ paths, i }: { paths: Record<"plain" | "discretized", SkewPath>; i: number }) => {
  const ys = [...paths.plain, ...paths.discretized].map((p) => p[1]);
  const pad = ROBOT * 0.8;
  const minX = -pad;
  const maxX = DISTANCE + pad;
  const minY = Math.min(-pad, Math.min(...ys) - pad);
  const maxY = Math.max(pad, Math.max(...ys) + pad);
  const width = 640;
  const k = width / (maxX - minX);
  const h = (maxY - minY) * k;
  const sx = (x: number) => (x - minX) * k;
  const sy = (y: number) => (maxY - y) * k;
  const line = (pts: SkewPath) => pts.map(([x, y], j) => `${j ? "L" : "M"}${px(sx(x))},${px(sy(y))}`).join("");
  const grid: number[] = [];
  for (let g = Math.ceil(minX); g <= maxX; g++) grid.push(g);

  return (
    <svg
      viewBox={`0 0 ${width} ${px(h)}`}
      role="img"
      aria-label="Top-down view of a robot told to drive a straight line while spinning, with and without discretization"
      className="h-auto w-full rounded-lg border border-fd-border">
      {grid.map((g) => (
        <line
          key={g}
          x1={px(sx(g))}
          x2={px(sx(g))}
          y1={0}
          y2={px(h)}
          className="stroke-fd-border"
        />
      ))}
      <line
        x1={px(sx(0))}
        x2={px(sx(DISTANCE))}
        y1={px(sy(0))}
        y2={px(sy(0))}
        stroke="var(--color-plot-muted)"
        strokeWidth={2}
        strokeDasharray="6 5"
      />
      {PATHS.map((p) => (
        <path
          key={p.id}
          d={line(paths[p.id].slice(0, i + 1))}
          fill="none"
          stroke={p.color}
          strokeWidth={2}
        />
      ))}
      {PATHS.map((p) => {
        const [x, y, heading] = paths[p.id][i];
        return (
          <Robot
            key={p.id}
            x={sx(x)}
            y={sy(y)}
            heading={heading}
            size={ROBOT * k}
            color={p.color}
          />
        );
      })}
    </svg>
  );
};

/**
 * Skew from holding swerve commands for a whole loop while the robot spins. The robot is told to drive straight along
 * the field while turning. Every loop it reads the heading, turns the request into robot-relative speeds, and holds
 * them. Without discretization it drifts off the line at half a loop's turn. With WPILib's discretization it ends
 * every loop on the line.
 */
export const SwerveSkew = () => {
  const [speed, setSpeed] = useState(3);
  const [spin, setSpin] = useState(360);
  const [rate, setRate] = useState<"50" | "100" | "250">("50");
  // Playback position from 0 to 1. Starts at the end, so the whole drive shows at first.
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(1);

  const sim = useMemo(
    () => simulateSkew({ speed, spinRate: (spin * Math.PI) / 180, rateHz: Number(rate), distance: DISTANCE }),
    [speed, spin, rate]
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

  const last = sim.plain.length - 1;
  const i = Math.round(progress * last);
  const duration = (sim.loopEnds.length - 1) * sim.dt;
  const drift = (spin * sim.dt) / 2;
  // Sideways error at the end of each loop, against distance along the requested line.
  const errors = (path: SkewPath) => sim.loopEnds.map((j): [number, number] => [path[j][0], path[j][1] * 100]);
  const endError = (path: SkewPath) => path[last][1] * 100;
  const yMax = niceCeil(Math.max(1, ...sim.plain.map((p) => Math.abs(p[1]) * 100)));

  return (
    <Widget title="Skew: holding commands while the robot spins">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Speed along the field"
          value={speed}
          min={1}
          max={5}
          step={0.5}
          format={(v) => `${fmt(v)} m/s`}
          onChange={setSpeed}
        />
        <Slider
          label="Spin rate"
          value={spin}
          min={0}
          max={720}
          step={15}
          format={(v) => `${v}°/s`}
          onChange={setSpin}
        />
        <Segmented
          label="Command rate (how often the code sends new module states)"
          value={rate}
          onChange={setRate}
          options={[
            { value: "50", label: "50 Hz" },
            { value: "100", label: "100 Hz" },
            { value: "250", label: "250 Hz" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3">
        <FieldView
          paths={sim}
          i={i}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: "var(--color-plot-muted)" }}
            />
            Requested line
          </span>
          {PATHS.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-sm border-2"
                style={{ borderColor: p.color }}
              />
              {p.label}
            </span>
          ))}
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr]">
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
        </div>
      </div>

      <LinePlot
        series={PATHS.map((p) => ({ label: p.label, points: errors(sim[p.id]), color: p.color }))}
        markers={progress < 1 ? [{ x: sim.plain[i][0] }] : []}
        xMax={DISTANCE}
        yMin={-yMax}
        yMax={yMax}
        xLabel="Distance along the field (m)"
        yLabel="Sideways error (cm)"
        ariaLabel="Sideways error against distance, with and without discretization"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Turn in one loop"
          value={fmt(spin * sim.dt, 2)}
          unit="°"
        />
        <Readout
          label="Off course, not discretized"
          value={fmt(drift, 2)}
          unit="°"
        />
        <Readout
          label={`Not discretized, after ${DISTANCE} m`}
          value={fmt(endError(sim.plain), 3)}
          unit="cm"
        />
        <Readout
          label={`Discretized, after ${DISTANCE} m`}
          value={fmt(Math.abs(endError(sim.discretized)) < 1e-6 ? 0 : endError(sim.discretized), 2)}
          unit="cm"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        The robot is told to drive along field +x while spinning. Each loop the code reads a perfect gyro, turns the
        request into robot-relative speeds, and holds them until the next loop. The modules follow every command
        exactly. They don&apos;t slip, and they steer and change speed instantly. Error is measured at the end of each
        loop. The robot is drawn to scale ({ROBOT} m), with a bar on its front edge.
      </p>
    </Widget>
  );
};
