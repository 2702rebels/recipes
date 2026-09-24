"use client";

import { useMemo, useState } from "react";

import { makeLineScenario, rmsError, runKalman, runSmoother, type RobustKernel } from "@/lib/localization-sim";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil } from "./vision-views";

const DURATION = 20;
const GAP: [number, number] = [6, 11];
const SHOVE = { time: 14, size: 0.5 };

/**
 * A chain factor graph (prior, odometry factors, vision factors) on the same one-axis scenario as the Kalman filter,
 * with bad measurements right after a stretch with no tags. Compares a Kalman filter, the live output of an
 * incremental smoother, and the trajectory re-solved in hindsight, with and without robust kernels.
 */
export const FactorGraphSmoother = () => {
  const [kernel, setKernel] = useState<RobustKernel>("cauchy");
  const [outliers, setOutliers] = useState(3);
  const [gate, setGate] = useState<"none" | "3">("none");
  const [shove, setShove] = useState<"on" | "off">("off");

  const { s, kf, sm } = useMemo(() => {
    const scenario = makeLineScenario({
      duration: DURATION,
      odometryNoise: 0.05,
      visionNoise: 0.1,
      visionRate: 10,
      gap: GAP,
      shove: shove === "on" ? SHOVE : null,
      outliers,
    });
    return {
      s: scenario,
      kf: runKalman(scenario, gate === "3" ? 3 : Infinity),
      sm: runSmoother(scenario, kernel),
    };
  }, [kernel, outliers, gate, shove]);

  const toCm = (e: number[]) => s.t.map((t, i): [number, number] => [t, (e[i] - s.truth[i]) * 100]);
  const yMax = niceCeil(
    Math.max(
      20,
      ...[kf.estimate, sm.live, sm.hindsight].flatMap((e) => e.map((v, i) => Math.abs(v - s.truth[i]) * 100))
    )
  );
  const bad = s.measurements.map((m, i) => ({ m, w: sm.weights[i] })).filter(({ m }) => m.outlier);
  const badWeight = bad.length ? bad.reduce((sum, b) => sum + b.w, 0) / bad.length : NaN;

  return (
    <Widget title="Factor graph smoothing: one axis">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Vision factor loss"
          value={kernel}
          onChange={setKernel}
          options={[
            { value: "gaussian", label: "Least squares" },
            { value: "huber", label: "Huber" },
            { value: "cauchy", label: "Cauchy" },
          ]}
        />
        <Slider
          label="Bad measurements after the gap"
          value={outliers}
          min={0}
          max={5}
          step={1}
          format={(v) => `${v}`}
          onChange={setOutliers}
        />
        <Segmented
          label="Kalman filter outlier gate"
          value={gate}
          onChange={setGate}
          options={[
            { value: "none", label: "None" },
            { value: "3", label: "3σ" },
          ]}
        />
        <Segmented
          label="Shove at 14 s (50 cm)"
          value={shove}
          onChange={setShove}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
        />
      </div>

      <LinePlot
        series={[
          { label: "Kalman filter", points: toCm(kf.estimate), color: "var(--color-plot-2)" },
          { label: "Smoother, live", points: toCm(sm.live), color: "var(--color-plot-1)" },
          { label: "Smoother, hindsight", points: toCm(sm.hindsight), color: "var(--color-plot-4)", dashed: true },
        ]}
        bands={[
          {
            label: "No tags in view",
            color: "var(--color-plot-zone-2)",
            polygon: [
              [GAP[0], -yMax],
              [GAP[1], -yMax],
              [GAP[1], yMax],
              [GAP[0], yMax],
            ],
          },
        ]}
        markers={bad.map(({ m }, i) => ({
          x: s.t[m.k],
          label: i === 0 ? "Bad" : undefined,
          color: "var(--color-plot-2)",
        }))}
        xMax={DURATION}
        yMin={-yMax}
        yMax={yMax}
        xLabel="Time (s)"
        yLabel="Position error (cm)"
        ariaLabel="Position error over time for a Kalman filter, a live smoother, and the smoothed trajectory in hindsight"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Kalman filter, RMS"
          value={fmt(rmsError(kf.estimate, s.truth) * 100)}
          unit="cm"
        />
        <Readout
          label="Smoother live, RMS"
          value={fmt(rmsError(sm.live, s.truth) * 100)}
          unit="cm"
        />
        <Readout
          label="Smoother hindsight, RMS"
          value={fmt(rmsError(sm.hindsight, s.truth) * 100)}
          unit="cm"
        />
        <Readout
          label="Weight on bad measurements"
          value={fmt(badWeight, 2)}
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Model: the scenario from the Kalman filter widget, with 10 cm vision noise at 10 per second and odometry noise
        of 5 cm per √m. Bad measurements are 1 to 2 m off, all to the same side, like a flipped single-tag solve. The
        smoother re-solves the whole graph after each measurement, as iSAM2 does incrementally.
      </p>
    </Widget>
  );
};
