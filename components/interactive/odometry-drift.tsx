"use client";

import { useMemo, useState } from "react";

import { FIELD_LENGTH, FIELD_TAGS, FIELD_WIDTH, simulateOdometry } from "@/lib/odometry-sim";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { px } from "./vision-views";

/** One full FRC match: 15 s autonomous plus 2:15 teleop. */
const DURATION = 150;

/** Top-down field with the three paths. Field units are meters, drawn at 50 px per meter with y pointing up. */
const FieldView = ({
  truth,
  odometry,
  fused,
  collisions,
  showFused,
}: {
  truth: [number, number][];
  odometry: [number, number][];
  fused: [number, number][];
  collisions: [number, number][];
  showFused: boolean;
}) => {
  const k = 50;
  // Room around the field, so an odometry estimate that drifts off the field stays visible.
  const pad = 60;
  const w = FIELD_LENGTH * k + 2 * pad;
  const h = FIELD_WIDTH * k + 2 * pad;
  const sx = (x: number) => px(pad + x * k);
  const sy = (y: number) => px(pad + (FIELD_WIDTH - y) * k);
  const line = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const end = (pts: [number, number][]) => pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Top-down field view with the true path, the odometry estimate, and the fused estimate"
      className="h-auto w-full">
      <rect
        x={pad}
        y={pad}
        width={FIELD_LENGTH * k}
        height={FIELD_WIDTH * k}
        rx={8}
        fill="none"
        className="stroke-fd-border"
        strokeWidth={2}
      />
      <line
        x1={sx(FIELD_LENGTH / 2)}
        x2={sx(FIELD_LENGTH / 2)}
        y1={pad}
        y2={pad + FIELD_WIDTH * k}
        className="stroke-fd-border"
        strokeDasharray="4 6"
      />
      {FIELD_TAGS.map((t, i) => {
        // Short bar along the tag face, with a tick showing which way it faces.
        const fx = Math.cos(t.yaw);
        const fy = Math.sin(t.yaw);
        const x = sx(t.x + fx * 0.08);
        const y = sy(t.y + fy * 0.08);
        return (
          <g key={i}>
            <line
              x1={px(x - fy * 12)}
              y1={px(y - fx * 12)}
              x2={px(x + fy * 12)}
              y2={px(y + fx * 12)}
              stroke="var(--color-tag-ink)"
              strokeWidth={6}
              className="dark:stroke-fd-foreground"
            />
            <line
              x1={x}
              y1={y}
              x2={px(x + fx * 12)}
              y2={px(y - fy * 12)}
              className="stroke-fd-muted-foreground"
              strokeWidth={2}
            />
          </g>
        );
      })}
      <path
        d={line(truth)}
        fill="none"
        stroke="var(--color-plot-muted)"
        strokeOpacity={0.5}
        strokeWidth={6}
      />
      <path
        d={line(odometry)}
        fill="none"
        stroke="var(--color-plot-2)"
        strokeWidth={2}
        strokeDasharray="7 5"
      />
      {showFused && (
        <path
          d={line(fused)}
          fill="none"
          stroke="var(--color-plot-1)"
          strokeWidth={2}
        />
      )}
      {collisions.map(([x, y], i) => (
        <g
          key={i}
          stroke="var(--color-plot-2)"
          strokeWidth={3}>
          <line
            x1={sx(x) - 7}
            y1={sy(y) - 7}
            x2={sx(x) + 7}
            y2={sy(y) + 7}
          />
          <line
            x1={sx(x) - 7}
            y1={sy(y) + 7}
            x2={sx(x) + 7}
            y2={sy(y) - 7}
          />
        </g>
      ))}
      <circle
        cx={sx(end(truth)[0])}
        cy={sy(end(truth)[1])}
        r={9}
        fill="var(--color-plot-muted)"
      />
      <circle
        cx={sx(end(odometry)[0])}
        cy={sy(end(odometry)[1])}
        r={7}
        fill="var(--color-plot-2)"
      />
      {showFused && (
        <circle
          cx={sx(end(fused)[0])}
          cy={sy(end(fused)[1])}
          r={7}
          fill="var(--color-plot-1)"
        />
      )}
    </svg>
  );
};

/**
 * A robot drives figure-eights for a full match. Wheel odometry drifts from wheel size error, gyro drift, and wheel slip in
 * collisions. Vision measurements pull the fused estimate back to the truth whenever a tag is in view.
 */
export const OdometryDrift = () => {
  const [wheel, setWheel] = useState(0.02);
  const [drift, setDrift] = useState(2);
  const [collisions, setCollisions] = useState(3);
  const [vision, setVision] = useState<"on" | "off">("on");
  const [noise, setNoise] = useState(0.03);

  const sim = useMemo(
    () =>
      simulateOdometry({
        wheelScaleError: wheel,
        gyroDriftDegPerMin: drift,
        collisionsPerMin: collisions,
        vision: vision === "on",
        visionNoiseAt2m: noise,
        duration: DURATION,
      }),
    [wheel, drift, collisions, vision, noise]
  );

  const withVision = vision === "on";
  const last = sim.t.length - 1;
  const fusedMean = withVision ? sim.fusedError.reduce((s, e) => s + e, 0) / sim.fusedError.length : NaN;
  // Rounded up to 0.1 m, so the axis is the same on the server and in the browser.
  const yMax = Math.ceil(Math.max(0.2, ...sim.odometryError) * 11) / 10;
  const series = [
    {
      label: "Odometry only",
      points: sim.t.map((t, i): [number, number] => [t, sim.odometryError[i]]),
      color: "var(--color-plot-2)",
      dashed: true,
    },
    ...(withVision
      ? [
          {
            label: "Odometry + vision",
            points: sim.t.map((t, i): [number, number] => [t, sim.fusedError[i]]),
            color: "var(--color-plot-1)",
          },
        ]
      : []),
  ];

  return (
    <Widget title="Odometry drift: one match of driving">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Wheel diameter error"
          value={wheel}
          min={0}
          max={0.05}
          step={0.0025}
          format={(v) => `${fmt(v * 100)}%`}
          onChange={setWheel}
        />
        <Slider
          label="Gyro drift"
          value={drift}
          min={0}
          max={10}
          step={0.5}
          format={(v) => `${fmt(v)}°/min`}
          onChange={setDrift}
        />
        <Slider
          label="Collisions (wheel slip)"
          value={collisions}
          min={0}
          max={20}
          step={1}
          format={(v) => `${v} per min`}
          onChange={setCollisions}
        />
        <Slider
          label="Vision noise with a tag 2 m away"
          value={noise}
          min={0.01}
          max={0.15}
          step={0.005}
          format={(v) => `${fmt(v * 100)} cm`}
          onChange={setNoise}
        />
        <Segmented
          label="Vision"
          value={vision}
          onChange={setVision}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>

      <FieldView
        truth={sim.truth}
        odometry={sim.odometry}
        fused={sim.fused}
        collisions={sim.collisions}
        showFused={withVision}
      />
      <p className="-mt-3 text-xs text-fd-muted-foreground">
        Thick gray: where the robot really went. Dashed: odometry alone. Solid: odometry fused with vision. Crosses mark
        collisions. Short bars are tags (illustrative positions), with a tick on the side they face.
      </p>

      <LinePlot
        series={series}
        xMax={DURATION}
        yMax={yMax}
        xLabel="Time (s)"
        yLabel="Position error (m)"
        ariaLabel="Position error over time for odometry alone and for odometry fused with vision"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout
          label="Odometry error at the end"
          value={fmt(sim.odometryError[last] * 100)}
          unit="cm"
        />
        <Readout
          label="Fused error, average"
          value={withVision ? fmt(fusedMean * 100) : "—"}
          unit="cm"
        />
        <Readout
          label="Vision measurements used"
          value={String(sim.measurements.length)}
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Model: front and back cameras (70° field of view, tags detected up to 5 m), 10 measurements per second, and a
        simple Kalman filter that trusts the gyro for heading. Vision noise grows with the square of the distance to the
        tag. It ignores latency, motion blur, and bad measurements that a real estimator must reject.
      </p>
    </Widget>
  );
};
