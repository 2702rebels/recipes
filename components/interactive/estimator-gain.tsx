"use client";

import { useMemo, useState } from "react";

import { makeLineScenario, rmsError, runKalman, runWpilib, wpilibGain } from "@/lib/localization-sim";

import { fmt, Readout, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { niceCeil } from "./vision-views";

const DURATION = 16;
const SHOVE = { time: 8, size: 0.5 };
const VISION_NOISE = 0.1;
/** An error below this counts as recovered from the shove (m). */
const RECOVERED = 0.1;

/** Seconds after the shove until the error first drops below {@link RECOVERED}, or `NaN` if it never does. */
const recoveryTime = (t: number[], estimate: number[], truth: number[]) => {
  for (let i = 0; i < t.length; i++) {
    if (t[i] >= SHOVE.time && Math.abs(estimate[i] - truth[i]) < RECOVERED) return t[i] - SHOVE.time;
  }
  return NaN;
};

/**
 * WPILib's pose estimator in one dimension next to a Kalman filter that knows the true noise. The robot is shoved
 * 0.5 m at 8 s, which the wheels don't see. Shows the fixed WPILib gain, how it trades noise for recovery speed, and
 * why the measurement rate matters as much as the standard deviations.
 */
export const EstimatorGain = () => {
  const [stateStdDev, setStateStdDev] = useState(0.1);
  const [visionStdDev, setVisionStdDev] = useState(0.9);
  const [visionRate, setVisionRate] = useState(10);

  const { s, wpilib, kf } = useMemo(() => {
    const scenario = makeLineScenario({
      duration: DURATION,
      odometryNoise: 0.05,
      visionNoise: VISION_NOISE,
      visionRate,
      gap: null,
      shove: SHOVE,
      outliers: 0,
    });
    return {
      s: scenario,
      wpilib: runWpilib(scenario, stateStdDev, visionStdDev),
      kf: runKalman(scenario),
    };
  }, [stateStdDev, visionStdDev, visionRate]);

  const gain = wpilibGain(stateStdDev, visionStdDev);
  // Time for the leftover fraction (1 - K)^n of an offset to fall to 10%.
  const settle = Math.log(0.1) / Math.log(1 - gain) / visionRate;
  const shoveIndex = s.t.findIndex((t) => t >= SHOVE.time);
  const toCm = (e: number[]) => s.t.map((t, i): [number, number] => [t, (e[i] - s.truth[i]) * 100]);
  const yMax = niceCeil(
    Math.max(...wpilib.estimate.map((e, i) => Math.abs(e - s.truth[i]) * 100), SHOVE.size * 100 * 1.05)
  );

  return (
    <Widget title="WPILib's gain: fixed fraction per measurement">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="State std dev"
          value={stateStdDev}
          min={0.01}
          max={1}
          log
          format={(v) => `${fmt(v, 2)} m`}
          onChange={setStateStdDev}
        />
        <Slider
          label="Vision std dev"
          value={visionStdDev}
          min={0.01}
          max={3}
          log
          format={(v) => `${fmt(v, 2)} m`}
          onChange={setVisionStdDev}
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
      </div>

      <LinePlot
        series={[
          { label: "WPILib estimator", points: toCm(wpilib.estimate), color: "var(--color-plot-1)" },
          {
            label: "Kalman filter (knows the true noise)",
            points: toCm(kf.estimate),
            color: "var(--color-plot-4)",
            dashed: true,
          },
        ]}
        markers={[{ x: SHOVE.time, label: "Shoved 50 cm" }]}
        xMax={DURATION}
        yMin={-yMax}
        yMax={yMax}
        xLabel="Time (s)"
        yLabel="Position error (cm)"
        ariaLabel="Position error over time for the WPILib estimator and for a Kalman filter, with a shove at 8 seconds"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Gain per measurement"
          value={fmt(gain, 2)}
          emphasis
        />
        <Readout
          label="Time to remove 90% of an offset"
          value={fmt(settle, 2)}
          unit="s"
        />
        <Readout
          label="RMS error before shove, WPILib / Kalman"
          value={`${fmt(rmsError(wpilib.estimate.slice(0, shoveIndex), s.truth) * 100, 2)} / ${fmt(rmsError(kf.estimate.slice(0, shoveIndex), s.truth) * 100, 2)}`}
          unit="cm"
        />
        <Readout
          label="Recovery below 10 cm, WPILib / Kalman"
          value={`${fmt(recoveryTime(s.t, wpilib.estimate, s.truth), 2)} / ${fmt(recoveryTime(s.t, kf.estimate, s.truth), 2)}`}
          unit="s"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Model: one axis, true vision noise 10 cm, odometry noise 5 cm per √m, no latency. Both estimators use the same
        measurements. The Kalman filter is given the true noise levels, and it does not know about the shove either.
      </p>
    </Widget>
  );
};
