"use client";

import { useMemo, useState } from "react";

import { makeLineScenario, rmsError, runKalman } from "@/lib/localization-sim";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil } from "./vision-views";

const DURATION = 20;
const GAP: [number, number] = [6, 11];

/**
 * A one-dimensional Kalman filter tracking a robot that drives back and forth. Shows the error, the ±2σ band the filter
 * claims, and how the gain rises during a stretch with no tags and falls again once measurements return.
 */
export const KalmanFilter1D = () => {
  const [odometryNoise, setOdometryNoise] = useState(0.05);
  const [visionNoise, setVisionNoise] = useState(0.1);
  const [visionRate, setVisionRate] = useState(10);
  const [gap, setGap] = useState<"on" | "off">("on");

  const { s, kf } = useMemo(() => {
    const scenario = makeLineScenario({
      duration: DURATION,
      odometryNoise,
      visionNoise,
      visionRate,
      gap: gap === "on" ? GAP : null,
      shove: null,
      outliers: 0,
    });
    return { s: scenario, kf: runKalman(scenario) };
  }, [odometryNoise, visionNoise, visionRate, gap]);

  const error = s.t.map((t, i): [number, number] => [t, (kf.estimate[i] - s.truth[i]) * 100]);
  const upper = s.t.map((t, i): [number, number] => [t, 2 * kf.sigma[i] * 100]);
  const lower = s.t.map((t, i): [number, number] => [t, -2 * kf.sigma[i] * 100]).reverse();
  const yMax = niceCeil(Math.max(...upper.map(([, v]) => v), ...error.map(([, v]) => Math.abs(v))));
  const inside = s.t.filter((_, i) => Math.abs(kf.estimate[i] - s.truth[i]) <= 2 * kf.sigma[i]).length / s.t.length;
  const firstAfterGap = s.measurements.findIndex((m) => s.t[m.k] >= GAP[1]);
  const gainAfterGap = gap === "on" && firstAfterGap >= 0 ? kf.gain[firstAfterGap] : NaN;

  return (
    <Widget title="Kalman filter: one axis">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Odometry noise"
          value={odometryNoise}
          min={0.01}
          max={0.15}
          step={0.01}
          format={(v) => `${fmt(v * 100)} cm per √m`}
          onChange={setOdometryNoise}
        />
        <Slider
          label="Vision noise (σ)"
          value={visionNoise}
          min={0.02}
          max={0.5}
          step={0.01}
          format={(v) => `${fmt(v * 100)} cm`}
          onChange={setVisionNoise}
        />
        <Slider
          label="Vision measurements"
          value={visionRate}
          min={1}
          max={20}
          step={1}
          format={(v) => `${v} per s`}
          onChange={setVisionRate}
        />
        <Segmented
          label="5 s with no tags in view"
          value={gap}
          onChange={setGap}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>

      <LinePlot
        series={[{ label: "Estimate − truth", points: error, color: "var(--color-plot-1)" }]}
        bands={[
          ...(gap === "on"
            ? [
                {
                  label: "No tags in view",
                  color: "var(--color-plot-zone-2)",
                  polygon: [
                    [GAP[0], -yMax],
                    [GAP[1], -yMax],
                    [GAP[1], yMax],
                    [GAP[0], yMax],
                  ] as [number, number][],
                },
              ]
            : []),
          { label: "±2σ the filter claims", color: "var(--color-plot-zone-1)", polygon: [...upper, ...lower] },
        ]}
        xMax={DURATION}
        yMin={-yMax}
        yMax={yMax}
        xLabel="Time (s)"
        yLabel="Position error (cm)"
        ariaLabel="Kalman filter position error over time, with the two-sigma band the filter claims"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="RMS error"
          value={fmt(rmsError(kf.estimate, s.truth) * 100, 2)}
          unit="cm"
        />
        <Readout
          label="Time inside ±2σ"
          value={fmt(inside * 100, 2)}
          unit="%"
        />
        <Readout
          label="Gain, steady"
          value={fmt(kf.gain[kf.gain.length - 1], 2)}
        />
        <Readout
          label="Gain, first tag after gap"
          value={fmt(gainAfterGap, 2)}
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Model: one axis, a robot swinging between 1 m and 7 m every 8 s. Odometry error grows with the square root of
        distance driven, and the filter knows the true noise levels. It ignores latency, slip, and bad measurements.
      </p>
    </Widget>
  );
};
