"use client";

import { useMemo, useState } from "react";

import { DEFAULT_CAMERA, TAG_SIZE, tagPoint } from "@/lib/vision";
import { rollingShutter } from "@/lib/vision-sims";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { px, TagInImage } from "./vision-views";

import type { Pixel, Tag } from "@/lib/vision";
import type { RobotError, ShutterResult } from "@/lib/vision-sims";

type Shutter = "global" | "rolling";

const DEG = Math.PI / 180;
const TRUTH = "var(--color-plot-3)";
const SOLVED = "var(--color-plot-1)";
const LATE = "var(--color-plot-2)";
const MUTED = "var(--color-plot-muted)";
/** Copies of the tag drawn across one exposure to show the motion blur. */
const BLUR_STEPS = 13;
const CROP_ASPECT = 1.6;

/** Meters to centimeters, rounded to 0.1 cm so tiny floating-point leftovers read as 0. */
const cm = (m: number) => fmt(Math.round(m * 1000) / 10);
const size = (e: RobotError) => Math.hypot(e.along, e.across);

/** Outer corner of the tag's white border (one cell outside the black square), `a` right and `b` up, ±1. */
const tagCorner = (tag: Tag, a: number, b: number) => {
  const h = ((tag.size ?? TAG_SIZE) / 2) * 1.25;
  return tagPoint(tag, a * h, b * h);
};

/** Close-up of the camera image around the tag, with the motion blur of one exposure and the global-shutter outline. */
const TagCloseUp = ({
  r,
  tag,
  exposure,
  shutter,
}: {
  r: ShutterResult;
  tag: Tag;
  exposure: number;
  shutter: Shutter;
}) => {
  const offsets = Array.from({ length: BLUR_STEPS }, (_, i) => (i / (BLUR_STEPS - 1) - 0.5) * exposure);
  // Frame the crop around everything drawn: the blurred copies and the reference outline.
  const outline = (offset: number) =>
    [-1, 1].flatMap((a) => [-1, 1].map((b) => r.capture(tagCorner(tag, a, b), offset))).filter((q) => q !== null);
  const pts: Pixel[] = [...offsets.flatMap(outline), ...r.globalPixels];
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let w = (Math.max(...xs) - Math.min(...xs)) * 1.35;
  let h = (Math.max(...ys) - Math.min(...ys)) * 1.35;
  if (w / h < CROP_ASPECT) w = h * CROP_ASPECT;
  else h = w / CROP_ASPECT;
  const view = [px(cx - w / 2), px(cy - h / 2), px(w), px(h)];
  const line = (pixels: Pixel[]) => pixels.map((q) => `${px(q[0])},${px(q[1])}`).join(" ");

  return (
    <svg
      viewBox={view.join(" ")}
      role="img"
      aria-label="Close-up of the tag in the camera image, as the shutter captures it while the robot moves"
      className="h-auto w-full rounded-md border border-fd-border bg-fd-muted">
      {offsets.map((o) => (
        <TagInImage
          key={o}
          K={DEFAULT_CAMERA}
          cam={r.camera}
          tag={tag}
          capture={(p) => r.capture(p, o)}
          opacity={2.4 / BLUR_STEPS}
        />
      ))}
      {shutter === "rolling" && (
        <polygon
          points={line(r.globalPixels)}
          fill="none"
          stroke={TRUTH}
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polygon
        points={line(r.pixels)}
        fill="none"
        stroke={SOLVED}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/** Top-down sketch: the true robot, where the tag-heading solve puts it, and where a frame-start timestamp puts it. */
const TopDown = ({ r, distance }: { r: ShutterResult; distance: number }) => {
  const W = 300;
  const H = 220;
  const marks = [
    { e: null, color: TRUTH },
    { e: r.solved, color: SOLVED },
    { e: r.gyroFrameStart, color: LATE },
  ];
  const at = (e: RobotError | null): [number, number] => (e ? [-e.along, e.across] : [0, 0]);
  const reach = Math.max(1.2, ...marks.map((m) => Math.hypot(...at(m.e)) + 0.5));
  const xMin = -reach;
  const xMax = distance + 0.3;
  const yHalf = reach;
  const k = Math.min((W - 20) / (xMax - xMin), (H - 20) / (2 * yHalf));
  const sx = (x: number) => px(10 + (x - xMin) * k);
  const sy = (y: number) => px(H / 2 - y * k);
  const tick = 0.35;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down view of the true robot position and the solved positions"
      className="h-auto w-full">
      <line
        x1={sx(0)}
        y1={sy(0)}
        x2={sx(distance)}
        y2={sy(0)}
        stroke={MUTED}
        strokeDasharray="2 4"
      />
      <line
        x1={sx(distance)}
        y1={sy(-0.12)}
        x2={sx(distance)}
        y2={sy(0.12)}
        className="stroke-fd-foreground"
        strokeWidth={5}
      />
      <text
        x={sx(distance)}
        y={sy(0) - 14}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        tag
      </text>
      {marks.map(({ e, color }, i) => {
        const [x, y] = at(e);
        const yaw = e?.heading ?? 0;
        return (
          <g key={i}>
            <line
              x1={sx(x)}
              y1={sy(y)}
              x2={sx(x + tick * Math.cos(yaw))}
              y2={sy(y + tick * Math.sin(yaw))}
              stroke={color}
              strokeWidth={2}
            />
            <circle
              cx={sx(x)}
              cy={sy(y)}
              r={i === 0 ? 6 : 4.5}
              fill={color}
              fillOpacity={i === 0 ? 0.5 : 0.9}
              stroke={color}
            />
          </g>
        );
      })}
      <text
        x={10}
        y={H - 6}
        className="fill-fd-muted-foreground text-[11px]">
        to scale, heading ticks from each position
      </text>
    </svg>
  );
};

/**
 * A tag seen from a moving robot through a global or rolling shutter. Shows the tag as captured (sheared by the
 * rolling readout, smeared by the exposure), and the pose errors that follow: with the heading solved from the tag,
 * with the heading from the gyro, and with the measurement timestamped at the start of the frame.
 */
export const RollingShutter = () => {
  const [shutter, setShutter] = useState<Shutter>("rolling");
  const [readoutMs, setReadoutMs] = useState(20);
  const [turnRate, setTurnRate] = useState(360);
  const [lateralSpeed, setLateralSpeed] = useState(0);
  const [distance, setDistance] = useState(3);
  const [exposureMs, setExposureMs] = useState(2);

  const tag: Tag = useMemo(() => ({ center: [distance, 0, 0.5], yaw: Math.PI }), [distance]);
  const r = useMemo(
    () =>
      rollingShutter({
        distance,
        turnRateDegS: turnRate,
        lateralSpeed,
        readout: shutter === "rolling" ? readoutMs / 1000 : 0,
        exposure: exposureMs / 1000,
      }),
    [distance, turnRate, lateralSpeed, shutter, readoutMs, exposureMs]
  );

  return (
    <Widget title="Rolling vs. global shutter: a tag seen while moving">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Shutter"
          value={shutter}
          onChange={setShutter}
          options={[
            { value: "rolling", label: "Rolling" },
            { value: "global", label: "Global" },
          ]}
        />
        <Slider
          label="Frame readout time (rolling only)"
          value={readoutMs}
          min={5}
          max={33}
          step={1}
          format={(v) => `${v} ms`}
          onChange={setReadoutMs}
        />
        <Slider
          label="Robot turn rate"
          value={turnRate}
          min={-720}
          max={720}
          step={30}
          format={(v) => `${v}°/s`}
          onChange={setTurnRate}
        />
        <Slider
          label="Robot speed across the line of sight"
          value={lateralSpeed}
          min={-4}
          max={4}
          step={0.25}
          format={(v) => `${fmt(v, 2)} m/s`}
          onChange={setLateralSpeed}
        />
        <Slider
          label="Distance to tag"
          value={distance}
          min={1}
          max={6}
          step={0.25}
          format={(v) => `${fmt(v, 2)} m`}
          onChange={setDistance}
        />
        <Slider
          label="Exposure time"
          value={exposureMs}
          min={0.5}
          max={20}
          step={0.5}
          format={(v) => `${fmt(v, 1)} ms`}
          onChange={setExposureMs}
        />
      </div>

      {r ? (
        <>
          <div className="grid items-start gap-4 md:grid-cols-[3fr_2fr]">
            <figure className="m-0">
              <TagCloseUp
                r={r}
                tag={tag}
                exposure={exposureMs / 1000}
                shutter={shutter}
              />
              <figcaption className="mt-1 text-xs text-fd-muted-foreground">
                Close-up of the {DEFAULT_CAMERA.width}×{DEFAULT_CAMERA.height} image. Solid: the corners the detector
                finds. Dashed green: where a global shutter would put them. The smear is the motion during one exposure.
              </figcaption>
            </figure>
            <figure className="m-0">
              <TopDown
                r={r}
                distance={distance}
              />
              <figcaption className="flex flex-col gap-1 text-xs text-fd-muted-foreground">
                {[
                  { color: TRUTH, label: "True robot" },
                  { color: SOLVED, label: "Heading solved from the tag" },
                  { color: LATE, label: "Gyro heading, frame-start timestamp" },
                ].map((m) => (
                  <span
                    key={m.label}
                    className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: m.color }}
                    />
                    {m.label}
                  </span>
                ))}
              </figcaption>
            </figure>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout
              label="Skew across the tag"
              value={fmt(Math.round(Math.abs(r.skewPx) * 10) / 10)}
              unit="px"
            />
            <Readout
              label="Motion blur"
              value={fmt(Math.round(r.blurPx * 10) / 10)}
              unit="px"
            />
            <Readout
              label="Position error, heading from the tag"
              value={cm(size(r.solved))}
              unit="cm"
            />
            <Readout
              label="Heading error, solved from the tag"
              value={fmt(Math.round((Math.abs(r.solved.heading) * 10) / DEG) / 10)}
              unit="°"
            />
            <Readout
              label="Tag rows read over"
              value={fmt(Math.round(r.tagReadTime * 1e5) / 100, 2)}
              unit="ms"
            />
            <Readout
              label="Reprojection error the solver reports"
              value={fmt(Math.round(r.rmsError * 100) / 100)}
              unit="px"
            />
            <Readout
              label="Position error, gyro heading, tag-row timestamp"
              value={cm(size(r.gyro))}
              unit="cm"
            />
            <Readout
              label={`Position error, gyro heading, frame-start timestamp (${fmt(Math.round(r.frameStartOffset * 1e4) / 10)} ms early)`}
              value={cm(size(r.gyroFrameStart))}
              unit="cm"
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-fd-muted-foreground">The tag is outside the image. Slow the robot down.</p>
      )}
      <p className="text-xs text-fd-muted-foreground">
        The camera is the 1280×800, 70° camera from the pose estimation page, 0.4 m high at the robot&apos;s center,
        looking straight at a tag 0.5 m high. There is no noise and no calibration error, so every error here comes from
        motion. Rows are read from the top of the image to the bottom. All errors are measured against the robot&apos;s
        true pose at the moment the tag&apos;s center row was read, except the last one, which uses the start of the
        frame. The blur is drawn but not simulated in the detector: a real detector would lose the tag long before the
        smear gets this large.
      </p>
    </Widget>
  );
};
