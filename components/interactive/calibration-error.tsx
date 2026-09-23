"use client";

import { useId, useMemo, useState } from "react";

import { calibrationSweep } from "@/lib/vision-sims";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { LinePlot } from "./plot";
import { px, TopDownTag } from "./vision-views";

import type { Tag } from "@/lib/vision";
import type { CalibrationPoint, RobotError } from "@/lib/vision-sims";

type Heading = "gyro" | "solved";

const DISTANCES = Array.from({ length: 23 }, (_, i) => 0.5 + i * 0.25);
const DEG = Math.PI / 180;
const TRUTH = "var(--color-plot-3)";
const ESTIMATE = "var(--color-plot-1)";
const MUTED = "var(--color-plot-muted)";
/** Error magnifications to pick from, so the drawn errors stay readable but inside the scene. */
const MAGNIFICATIONS = [1, 2, 5, 10, 20, 50, 100];
/** Largest drawn error (m) the magnification aims for. */
const DRAWN_ERROR = 1;
/** Robot frame side (m), drawn to scale. */
const ROBOT = 0.7;
const W = 640;
const H = 290;
const SCENE = { x: 10, y: 10, w: 620, h: 250 };
/** The tag sits on the field wall, facing back toward the robot (−x). */
const TAG: Tag = { center: [0, 0, 0.5], yaw: Math.PI };

/** Meters to centimeters, rounded to 0.1 cm so tiny floating-point leftovers read as 0. */
const cm = (m: number) => fmt(Math.round(m * 1000) / 10);

/** Where the robot is estimated to be on the field, in the scene frame (tag at the origin, robot on the −x side). */
const estimated = (distance: number, e: RobotError, magnify: number): [number, number] => [
  -distance - e.along * magnify,
  e.across * magnify,
];

interface FieldViewProps {
  points: CalibrationPoint[];
  heading: Heading;
  distance: number;
  bearingDeg: number;
}

/**
 * Top-down field view: the robot drives straight at a tag on the wall, and the solver places it with the wrong
 * intrinsics. Shows the true and estimated robot at the chosen distance, and the estimated path over all distances.
 * Errors are magnified by a round factor so centimeters show up next to meters.
 */
const FieldView = ({ points, heading, distance, bearingDeg }: FieldViewProps) => {
  const clip = useId();
  const arrow = useId();
  const errorOf = (p: CalibrationPoint) => p[heading];

  const largest = Math.max(0, ...points.map((p) => Math.hypot(errorOf(p).along, errorOf(p).across)));
  const noError = largest < 0.0005;
  const magnify = noError
    ? 1
    : ([...MAGNIFICATIONS].reverse().find((m) => largest * m <= DRAWN_ERROR) ?? MAGNIFICATIONS[0]);

  const path = points.map((p) => estimated(p.distance, errorOf(p), magnify));
  const here = points.find((p) => Math.abs(p.distance - distance) < 1e-9);
  const hereEst = here ? estimated(distance, errorOf(here), magnify) : null;

  // Scene bounds (m): everything the drawing needs, with room for the robot frames.
  const xMin = Math.min(-6.6, ...path.map((q) => q[0] - ROBOT / 2 - 0.1));
  const xMax = 0.45;
  const yHalf = Math.max(1.1, ...path.map((q) => Math.abs(q[1]) + ROBOT / 2 + 0.3));
  const k = Math.min(SCENE.w / (xMax - xMin), SCENE.h / (2 * yHalf));
  const ox = SCENE.x + (SCENE.w - (xMax - xMin) * k) / 2;
  const oy = SCENE.y + (SCENE.h - 2 * yHalf * k) / 2;
  const sx = (x: number) => px(ox + (x - xMin) * k);
  const sy = (y: number) => px(oy + (yHalf - y) * k);
  const map = { sx, sy, k };

  // The robot turns right by the bearing, so the tag shows up that far left of the image center.
  const trueHeading = -bearingDeg * DEG;
  const robot = (x: number, y: number, yaw: number, color: string, dashed: boolean) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const h = ROBOT / 2;
    const corners = [
      [h, h],
      [-h, h],
      [-h, -h],
      [h, -h],
    ].map(([a, b]) => `${sx(x + a * c - b * s)},${sy(y + a * s + b * c)}`);
    return (
      <g>
        <polygon
          points={corners.join(" ")}
          fill={color}
          fillOpacity={dashed ? 0.08 : 0.18}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
        {/* Heading: a line from the center to the front edge, where the camera looks out. */}
        <line
          x1={sx(x)}
          y1={sy(y)}
          x2={sx(x + h * c)}
          y2={sy(y + h * s)}
          stroke={color}
          strokeWidth={2}
        />
        <circle
          cx={sx(x)}
          cy={sy(y)}
          r={2.5}
          fill={color}
        />
      </g>
    );
  };

  const wallX = sx(0.12);
  const ticks = [1, 2, 3, 4, 5, 6];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down field view of the robot driving toward a tag, with the true and estimated robot positions"
      className="h-auto w-full">
      <defs>
        <clipPath id={clip}>
          <rect
            x={SCENE.x}
            y={SCENE.y}
            width={SCENE.w}
            height={SCENE.h}
          />
        </clipPath>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse">
          <path
            d="M0,0 L10,5 L0,10 Z"
            fill={ESTIMATE}
          />
        </marker>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {/* Field wall behind the tag. */}
        <line
          x1={wallX}
          x2={wallX}
          y1={SCENE.y}
          y2={SCENE.y + SCENE.h}
          className="stroke-fd-border"
          strokeWidth={4}
        />
        {/* Line of sight from the robot's camera to the tag. */}
        <line
          x1={sx(-distance)}
          y1={sy(0)}
          x2={sx(0)}
          y2={sy(0)}
          stroke={MUTED}
          strokeDasharray="2 4"
        />
        {/* True path: straight at the tag. */}
        <line
          x1={sx(-6)}
          y1={sy(0)}
          x2={sx(-0.5)}
          y2={sy(0)}
          stroke={TRUTH}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
        {/* Estimated path, with rungs linking each meter mark to where the solver puts it. */}
        {ticks.map((d) => {
          const p = points.find((q) => Math.abs(q.distance - d) < 1e-9);
          if (!p) return null;
          const [ex, ey] = estimated(d, errorOf(p), magnify);
          return (
            <g key={d}>
              <line
                x1={sx(-d)}
                y1={sy(0)}
                x2={sx(ex)}
                y2={sy(ey)}
                stroke={MUTED}
                strokeOpacity={0.7}
              />
              <circle
                cx={sx(-d)}
                cy={sy(0)}
                r={2.5}
                fill={TRUTH}
              />
              <circle
                cx={sx(ex)}
                cy={sy(ey)}
                r={2.5}
                fill={ESTIMATE}
              />
            </g>
          );
        })}
        <polyline
          points={path.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}
          fill="none"
          stroke={ESTIMATE}
          strokeWidth={2}
        />
        <TopDownTag
          tag={TAG}
          map={map}
          color="var(--color-fd-foreground)"
          tick
        />
        {robot(-distance, 0, trueHeading, TRUTH, false)}
        {hereEst &&
          here &&
          robot(hereEst[0], hereEst[1], trueHeading + (heading === "solved" ? here.solved.heading : 0), ESTIMATE, true)}
        {hereEst && !noError && Math.hypot(hereEst[0] + distance, hereEst[1]) * k > 12 && (
          <line
            x1={sx(-distance)}
            y1={sy(0)}
            x2={sx(hereEst[0])}
            y2={sy(hereEst[1])}
            stroke={ESTIMATE}
            strokeWidth={1.5}
            markerEnd={`url(#${arrow})`}
          />
        )}
      </g>
      {ticks.map((d) => (
        <text
          key={d}
          x={sx(-d)}
          y={SCENE.y + SCENE.h + 14}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-[11px]">
          {d} m
        </text>
      ))}
      <text
        x={wallX}
        y={SCENE.y + SCENE.h + 14}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        tag
      </text>
      <text
        x={SCENE.x + 4}
        y={SCENE.y + 12}
        className="fill-fd-muted-foreground text-[11px]">
        {noError ? "no position error" : magnify === 1 ? "errors drawn to scale" : `errors drawn ×${magnify}`}
      </text>
    </svg>
  );
};

/**
 * Pose error from calibration mistakes alone, with no noise: focal length, principal point, and lens distortion the
 * solver doesn't know about. Shows where the robot ends up on the field as it drives toward a tag, and plots the error
 * against distance.
 */
export const CalibrationError = () => {
  const [focal, setFocal] = useState(0.03);
  const [principal, setPrincipal] = useState(0);
  const [k1, setK1] = useState(0);
  const [bearing, setBearing] = useState(0);
  const [distance, setDistance] = useState(4);
  const [heading, setHeading] = useState<Heading>("gyro");

  const sweep = useMemo(
    () =>
      calibrationSweep({
        focalError: focal,
        principalOffsetPx: principal,
        trueK1: k1,
        bearingDeg: bearing,
        distances: DISTANCES,
      }),
    [focal, principal, k1, bearing]
  );

  const points = sweep.filter((p) => p !== null);
  const at = points.find((p) => Math.abs(p.distance - distance) < 1e-9);
  const err = (p: CalibrationPoint) => p[heading];
  // Whole centimeters, so the axis is the same on the server and in the browser.
  const extreme = Math.ceil(
    Math.max(0.02, ...points.flatMap((p) => [Math.abs(err(p).along), Math.abs(err(p).across)])) * 100 * 1.15
  );

  return (
    <Widget title="Calibration error: pose error with perfect corners">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Focal length error"
          value={focal}
          min={-0.05}
          max={0.05}
          step={0.0025}
          format={(v) => `${v > 0 ? "+" : ""}${fmt(v * 100)}%`}
          onChange={setFocal}
        />
        <Slider
          label="Principal point error (horizontal)"
          value={principal}
          min={-40}
          max={40}
          step={1}
          format={(v) => `${v} px`}
          onChange={setPrincipal}
        />
        <Slider
          label="Lens distortion the solver ignores (k1)"
          value={k1}
          min={-0.3}
          max={0}
          step={0.01}
          format={(v) => fmt(v, 2)}
          onChange={setK1}
        />
        <Slider
          label="Tag bearing from image center"
          value={bearing}
          min={0}
          max={30}
          step={1}
          format={(v) => `${v}°`}
          onChange={setBearing}
        />
        <Slider
          label="Robot distance to tag"
          value={distance}
          min={1}
          max={6}
          step={0.25}
          format={(v) => `${fmt(v, 2)} m`}
          onChange={setDistance}
        />
        <Segmented
          label="Heading"
          value={heading}
          onChange={setHeading}
          options={[
            { value: "gyro", label: "From the gyro" },
            { value: "solved", label: "Solved from the tag" },
          ]}
        />
      </div>

      <figure className="m-0">
        <FieldView
          points={points}
          heading={heading}
          distance={distance}
          bearingDeg={bearing}
        />
        <figcaption className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ background: TRUTH }}
            />
            True robot and path
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ background: ESTIMATE }}
            />
            Where the solver puts it
          </span>
        </figcaption>
      </figure>

      <LinePlot
        series={[
          {
            label: "Range error (cm)",
            points: points.map((p) => [p.distance, err(p).along * 100]),
            color: "var(--color-plot-1)",
          },
          {
            label: "Sideways error (cm)",
            points: points.map((p) => [p.distance, err(p).across * 100]),
            color: "var(--color-plot-2)",
            dashed: true,
          },
        ]}
        markers={[{ x: distance, label: `${fmt(distance, 2)} m` }]}
        xMax={6}
        yMin={-extreme}
        yMax={extreme}
        xLabel="Distance to tag (m)"
        yLabel="Robot position error (cm)"
        ariaLabel="Range and sideways error in the robot's estimated position against distance"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label={`Range error at ${fmt(distance, 2)} m`}
          value={at ? cm(err(at).along) : "—"}
          unit="cm"
        />
        <Readout
          label={`Sideways error at ${fmt(distance, 2)} m`}
          value={at ? cm(err(at).across) : "—"}
          unit="cm"
        />
        <Readout
          label={`Tag angle error at ${fmt(distance, 2)} m`}
          value={at ? fmt(Math.round((at.tagYaw * 1800) / Math.PI) / 10) : "—"}
          unit="°"
        />
        <Readout
          label="Reprojection error the solver reports"
          value={at ? fmt(Math.round(at.rmsError * 100) / 100) : "—"}
          unit="px"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Top-down view. The robot drives straight at a tag on the wall, turned so the tag appears at the set bearing from
        the image center. The camera sits at the robot&apos;s center. Robot frames and distances are to scale. Position
        errors are magnified by the factor shown, and heading errors are drawn as they are. The real camera is the
        1280×800, 70° camera from the pose estimation page, and the solver uses the wrong values set above. No noise is
        added, so every error here comes from the calibration. Range error is positive when the robot is placed farther
        from the tag, sideways error when it is placed to its own left.
      </p>
    </Widget>
  );
};
