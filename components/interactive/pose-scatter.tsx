"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";

import { poseScatter, sceneTags, type PoseSample, type TagLayout } from "@/lib/vision-sims";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { niceCeil, px, quantile, TopDownTag } from "./vision-views";

import type { Tag } from "@/lib/vision";

type Heading = "solve" | "gyro";

const SOLVED = "var(--color-plot-1)";
const MUTED = "var(--color-plot-muted)";
/** The true camera position, in the scene and in the inset. */
const TRUTH = "var(--color-plot-3)";
const W = 640;
const H = 300;
/** The scene fills the left part of the figure, the zoomed inset the right. */
const SCENE = { x: 10, y: 10, w: 390, h: 280 };
const INSET = { x: 425, y: 40, size: 200 };
const HALF_FOV = (35 * Math.PI) / 180;

interface SceneViewProps {
  tags: Tag[];
  distance: number;
  samples: PoseSample[];
}

/**
 * Top-down view of the camera and the tags, with the solved camera positions drawn in the scene, and a zoomed inset
 * around the true camera position. The inset uses the scene's orientation: toward the tags to the right, left up.
 */
const SceneView = ({ tags, distance, samples }: SceneViewProps) => {
  const clip = useId();

  // Half-width of the inset (cm), from the central 80% of solves. The rest, such as the flipped single-tag solutions,
  // show at true scale in the scene and pinned to the inset edge.
  const spread = samples.map((s) => Math.max(Math.abs(s.range), Math.abs(s.lateral)));
  const extent = niceCeil(quantile(spread, 0.8) * 100 * 1.15);
  const extentM = extent / 100;
  // Room around the camera in the scene: enough for the magnified square and nearly all solves.
  const around = Math.max(extentM, quantile(spread, 0.97));

  // Scene mapping, meters to pixels. The camera is at the origin looking right (+x), and +y (left) is up. The bounds
  // grow with the spread, so the magnified square around the camera always fits.
  const xMin = -Math.max(1, around + 0.35);
  const xMax = distance + 0.45;
  const yHalf = Math.max(1.2, around + 0.4);
  const k = Math.min(SCENE.w / (xMax - xMin), SCENE.h / (2 * yHalf));
  const ox = SCENE.x + (SCENE.w - (xMax - xMin) * k) / 2;
  const oy = SCENE.y + (SCENE.h - 2 * yHalf * k) / 2;
  const sx = (x: number) => px(ox + (x - xMin) * k);
  const sy = (y: number) => px(oy + (yHalf - y) * k);
  const map = { sx, sy, k };

  // Inset mapping, centimeters of error to pixels, centered on the true camera position.
  const half = INSET.size / 2;
  const cx = INSET.x + half;
  const cy = INSET.y + half;
  const clamp = (v: number) => Math.min(Math.max(v, -extent), extent);
  const ix = (rangeCm: number) => px(cx + (clamp(rangeCm) / extent) * half);
  const iy = (leftCm: number) => px(cy - (clamp(leftCm) / extent) * half);
  // Inset pixels per centimeter over scene pixels per centimeter.
  const zoom = half / extent / (k / 100);
  // With little zoom the magnifier would cover most of the scene and say nothing, so it is left out.
  const magnified = zoom >= 1.5;
  const ring = magnified ? (extent * k) / 100 : 0;
  const camX = sx(0);
  const camY = sy(0);
  const reach = distance + 0.3;
  const tagTop = Math.max(...tags.map((t) => t.center[1])) + 0.25;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down view of the camera and the tags, with the solved camera positions and a zoomed view around the true camera position"
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
      </defs>
      <g clipPath={`url(#${clip})`}>
        {/* Camera field of view. */}
        <path
          d={`M${camX},${camY} L${sx(reach)},${sy(reach * Math.tan(HALF_FOV))} L${sx(reach)},${sy(-reach * Math.tan(HALF_FOV))} Z`}
          fill={MUTED}
          fillOpacity={0.08}
          stroke={MUTED}
          strokeOpacity={0.4}
        />
        {tags.map((tag, i) => (
          <TopDownTag
            key={i}
            tag={tag}
            map={map}
            color="var(--color-fd-foreground)"
            tick
          />
        ))}
      </g>
      <rect
        x={camX - 7}
        y={camY - 7}
        width={14}
        height={14}
        rx={2}
        fill={TRUTH}
      />
      {/* Solved camera positions at true scale, on top of the camera marker. */}
      <g clipPath={`url(#${clip})`}>
        {samples.map((s, i) => (
          <circle
            key={i}
            cx={sx(s.range)}
            cy={sy(s.lateral)}
            r={1.6}
            fill={SOLVED}
            fillOpacity={0.35}
          />
        ))}
      </g>
      <text
        x={camX}
        y={px(camY + Math.max(ring, 7) + 14)}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        camera
      </text>
      <text
        x={sx(distance)}
        y={sy(tagTop) - 4}
        textAnchor="middle"
        className="fill-fd-foreground text-[11px]">
        {tags.length > 1 ? "tags" : "tag"}
      </text>

      {/* Magnifier around the true camera position, leading to the inset. */}
      {magnified && (
        <>
          <rect
            x={px(camX - ring)}
            y={px(camY - ring)}
            width={px(2 * ring)}
            height={px(2 * ring)}
            fill="none"
            stroke={MUTED}
            strokeDasharray="3 3"
          />
          <line
            x1={px(camX + ring)}
            y1={px(camY - ring)}
            x2={INSET.x}
            y2={INSET.y}
            stroke={MUTED}
            strokeOpacity={0.5}
          />
          <line
            x1={px(camX + ring)}
            y1={px(camY + ring)}
            x2={INSET.x}
            y2={INSET.y + INSET.size}
            stroke={MUTED}
            strokeOpacity={0.5}
          />
        </>
      )}

      {/* Inset: solved camera positions around the true one. */}
      <rect
        x={INSET.x}
        y={INSET.y}
        width={INSET.size}
        height={INSET.size}
        rx={4}
        className="fill-fd-background stroke-fd-border"
      />
      {[-1, -0.5, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={cx + f * half}
            x2={cx + f * half}
            y1={INSET.y}
            y2={INSET.y + INSET.size}
            className="stroke-fd-border"
          />
          <line
            x1={INSET.x}
            x2={INSET.x + INSET.size}
            y1={cy + f * half}
            y2={cy + f * half}
            className="stroke-fd-border"
          />
        </g>
      ))}
      {samples.map((s, i) => (
        <circle
          key={i}
          cx={ix(s.range * 100)}
          cy={iy(s.lateral * 100)}
          r={2}
          fill={SOLVED}
          fillOpacity={0.5}
        />
      ))}
      <g
        stroke={TRUTH}
        strokeWidth={2.5}>
        <line
          x1={cx - 8}
          x2={cx + 8}
          y1={cy}
          y2={cy}
        />
        <line
          x1={cx}
          x2={cx}
          y1={cy - 8}
          y2={cy + 8}
        />
      </g>
      <text
        x={cx}
        y={INSET.y - 8}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        {magnified ? `zoomed about ×${fmt(zoom, 2)}` : "about the same scale as the scene"}
      </text>
      <text
        x={cx}
        y={INSET.y + INSET.size + 16}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        grid: {fmt(extent / 2)} cm, edge: ±{fmt(extent)} cm
      </text>
    </svg>
  );
};

/**
 * Monte Carlo pose solving: adds random noise to the corners, solves the pose 300 times, and plots where the solver
 * put the camera. Compares one tag, two tags on one face, and two tags on angled faces, and a solved heading against
 * a heading taken from the gyro.
 */
export const PoseScatter = () => {
  const [layout, setLayout] = useState<TagLayout>("single");
  const [heading, setHeading] = useState<Heading>("solve");
  const [distance, setDistance] = useState(3);
  const [yawDeg, setYawDeg] = useState(15);
  const [noise, setNoise] = useState(0.5);

  const params = useDeferredValue({ layout, heading, distance, yawDeg, noise });
  const r = useMemo(
    () =>
      poseScatter({
        layout: params.layout,
        distance: params.distance,
        tagYawDeg: params.yawDeg,
        noisePx: params.noise,
        gyroHeading: params.heading === "gyro",
        trials: 300,
      }),
    [params]
  );
  const tags = useMemo(
    () => sceneTags(params.layout, params.distance, params.yawDeg),
    [params.layout, params.distance, params.yawDeg]
  );

  return (
    <Widget title="Pose scatter: where noise puts the camera">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Tags in view"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "single", label: "One" },
            { value: "pair", label: "Two, same face" },
            { value: "angled", label: "Two, angled faces" },
          ]}
        />
        <Segmented
          label="Heading"
          value={heading}
          onChange={setHeading}
          options={[
            { value: "solve", label: "Solved from tags" },
            { value: "gyro", label: "From the gyro" },
          ]}
        />
        <Slider
          label="Distance to tags"
          value={distance}
          min={1}
          max={6}
          step={0.1}
          format={(v) => `${fmt(v)} m`}
          onChange={setDistance}
        />
        <Slider
          label="Tags turned from facing the camera"
          value={yawDeg}
          min={0}
          max={45}
          step={1}
          format={(v) => `${v}°`}
          onChange={setYawDeg}
        />
        <Slider
          label="Corner noise (standard deviation)"
          value={noise}
          min={0.1}
          max={2}
          step={0.05}
          format={(v) => `${fmt(v)} px`}
          onChange={setNoise}
        />
      </div>

      {r.visible ? (
        <>
          <figure className="m-0">
            <SceneView
              tags={tags}
              distance={params.distance}
              samples={r.samples}
            />
            <figcaption className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: SOLVED }}
                />
                Solved camera position
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="font-semibold"
                  style={{ color: TRUTH }}>
                  +
                </span>
                True camera position
              </span>
            </figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout
              label="Range error (RMS)"
              value={fmt(r.rmsRange * 100)}
              unit="cm"
            />
            <Readout
              label="Sideways error (RMS)"
              value={fmt(r.rmsLateral * 100)}
              unit="cm"
            />
            <Readout
              label="Heading error (RMS)"
              value={params.heading === "gyro" ? "from gyro" : fmt((r.rmsYaw * 180) / Math.PI)}
              unit={params.heading === "gyro" ? undefined : "°"}
            />
            <Readout
              label="Tag width in the image"
              value={fmt(r.tagWidthPx)}
              unit="px"
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-fd-muted-foreground">
          The tags don&apos;t fit in the camera&apos;s view at this distance. Move farther away.
        </p>
      )}
      <p className="text-xs text-fd-muted-foreground">
        Top-down view, to scale except that tags are drawn larger. Each dot is one solve with fresh Gaussian noise on
        every corner: where the solver put the camera. The faint dots in the scene show the spread at true scale. The
        inset zooms in around the true camera position (the green cross), in the same orientation as the scene (toward
        the tags to the right, left up). Points beyond the inset edge are drawn on the edge. The camera (1280×800, 70°
        field of view, no distortion) looks straight at the tags. Paired tags are 0.6 m apart. Angled faces meet like
        two sides of a hexagon.
      </p>
    </Widget>
  );
};
