"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { TAG_SIZE } from "@/lib/vision";
import { relativeGlobalScene, relativeVsGlobal } from "@/lib/vision-sims";

import { fmt, Readout, Slider, Widget } from "./controls";
import { niceCeil, px, quantile, TAG_DRAW_SCALE, TopDownTag } from "./vision-views";

import type { PointSample, RelativeGlobalScene } from "@/lib/vision-sims";

const RELATIVE = "var(--color-plot-2)";
const GLOBAL = "var(--color-plot-1)";
const MUTED = "var(--color-plot-muted)";
/** Anything that comes from the field layout rather than from where things really are. */
const LAYOUT = "var(--color-plot-3)";

const W = 640;
const H = 300;
/** The scene fills the left part of the figure, the zoomed inset the right. */
const SCENE = { x: 10, y: 10, w: 390, h: 280 };
const INSET = { x: 425, y: 40, size: 200 };
const HALF_FOV = (35 * Math.PI) / 180;

interface ErrorViewProps {
  scene: RelativeGlobalScene;
  relative: PointSample[];
  global: PointSample[];
}

/**
 * Top-down view of the camera, the tags, and the scoring point, with a zoomed inset around the true scoring point.
 * The inset shows each method's estimates of the scoring point as a cloud, in the same orientation as the scene:
 * forward to the right, left up.
 */
const ErrorView = ({ scene, relative, global }: ErrorViewProps) => {
  const { layoutTarget, realTarget, other, trueScoring, layoutScoring } = scene;

  // Scene mapping, meters to pixels. The camera is at the origin looking right (+x), and +y (left) is up.
  const xMin = -0.35;
  const xMax = realTarget.center[0] + 0.35;
  const yMin = -0.9;
  const yMax = 1.25;
  const k = Math.min(SCENE.w / (xMax - xMin), SCENE.h / (yMax - yMin));
  const ox = SCENE.x + (SCENE.w - (xMax - xMin) * k) / 2;
  const oy = SCENE.y + (SCENE.h - (yMax - yMin) * k) / 2;
  const sx = (x: number) => px(ox + (x - xMin) * k);
  const sy = (y: number) => px(oy + (yMax - y) * k);

  // Inset mapping, centimeters of error to pixels, centered on the true scoring point.
  const layoutOffset: [number, number] = [
    (layoutScoring[0] - trueScoring[0]) * 100,
    (layoutScoring[1] - trueScoring[1]) * 100,
  ];
  const extent = niceCeil(
    Math.max(
      quantile(
        [...relative, ...global].map((s) => Math.max(Math.abs(s.range), Math.abs(s.lateral)) * 100),
        0.95
      ) * 1.15,
      Math.max(Math.abs(layoutOffset[0]), Math.abs(layoutOffset[1])) * 1.15
    )
  );
  const half = INSET.size / 2;
  const cx = INSET.x + half;
  const cy = INSET.y + half;
  const clamp = (v: number) => Math.min(Math.max(v, -extent), extent);
  const ix = (forwardCm: number) => px(cx + (clamp(forwardCm) / extent) * half);
  const iy = (leftCm: number) => px(cy - (clamp(leftCm) / extent) * half);
  // Inset pixels per centimeter over scene pixels per centimeter.
  const zoom = half / extent / (k / 100);

  /** A tag as a thin filled bar along its face. Semi-transparent, so a tag drawn on top of another stays visible. */
  const map = { sx, sy, k };
  const reach = realTarget.center[0] + 0.2;
  // Half-size of the scene square that the inset magnifies: the same ±extent as the inset.
  const ring = Math.max(4, (extent * k) / 100);
  const tx = sx(trueScoring[0]);
  const ty = sy(trueScoring[1]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Top-down view of the camera, the tags, and the scoring point, with a zoomed view of the scoring point errors"
      className="h-auto w-full">
      {/* Camera and its field of view. */}
      <path
        d={`M${sx(0)},${sy(0)} L${sx(reach)},${sy(reach * Math.tan(HALF_FOV))} L${sx(reach)},${sy(-reach * Math.tan(HALF_FOV))} Z`}
        fill={MUTED}
        fillOpacity={0.08}
        stroke={MUTED}
        strokeOpacity={0.4}
      />
      <rect
        x={sx(0) - 9}
        y={sy(0) - 7}
        width={14}
        height={14}
        rx={2}
        className="fill-fd-muted-foreground"
      />
      <text
        x={sx(0)}
        y={sy(0) + 22}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        camera
      </text>

      {/* Tags: where the target really is (solid), its layout position (dashed, on top), and the second tag. */}
      <TopDownTag
        tag={realTarget}
        map={map}
        color="var(--color-fd-foreground)"
        tick
      />
      <TopDownTag
        tag={layoutTarget}
        map={map}
        color={LAYOUT}
        fillOpacity={0.25}
        dashed
      />
      <text
        x={sx(realTarget.center[0])}
        y={px(sy(Math.min(realTarget.center[1], layoutTarget.center[1]) - (TAG_SIZE / 2) * TAG_DRAW_SCALE) + 16)}
        textAnchor="middle"
        className="fill-fd-foreground text-[11px]">
        target tag
      </text>
      <TopDownTag
        tag={other}
        map={map}
        color="var(--color-fd-foreground)"
        tick
      />
      <text
        x={sx(other.center[0])}
        y={sy(other.center[1] + 0.18) - 4}
        textAnchor="middle"
        className="fill-fd-foreground text-[11px]">
        second tag
      </text>

      {/* Scoring point and the magnifier leading to the inset. */}
      <rect
        x={px(tx - ring)}
        y={px(ty - ring)}
        width={px(2 * ring)}
        height={px(2 * ring)}
        fill="none"
        stroke={MUTED}
        strokeDasharray="3 3"
      />
      <line
        x1={px(tx + ring)}
        y1={px(ty - ring)}
        x2={INSET.x}
        y2={INSET.y}
        stroke={MUTED}
        strokeOpacity={0.5}
      />
      <line
        x1={px(tx + ring)}
        y1={px(ty + ring)}
        x2={INSET.x}
        y2={INSET.y + INSET.size}
        stroke={MUTED}
        strokeOpacity={0.5}
      />
      <circle
        cx={tx}
        cy={ty}
        r={3}
        className="fill-fd-foreground"
      />
      <text
        x={px(tx - ring - 6)}
        y={ty}
        textAnchor="end"
        dominantBaseline="middle"
        className="fill-fd-foreground text-[11px]">
        scoring point
      </text>

      {/* Inset: errors around the true scoring point. */}
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
      {relative.map((s, i) => (
        <circle
          key={`r${i}`}
          cx={ix(s.range * 100)}
          cy={iy(s.lateral * 100)}
          r={2}
          fill={RELATIVE}
          fillOpacity={0.5}
        />
      ))}
      {global.map((s, i) => (
        <circle
          key={`g${i}`}
          cx={ix(s.range * 100)}
          cy={iy(s.lateral * 100)}
          r={2}
          fill={GLOBAL}
          fillOpacity={0.5}
        />
      ))}
      <rect
        x={ix(layoutOffset[0]) - 5}
        y={iy(layoutOffset[1]) - 5}
        width={10}
        height={10}
        fill="none"
        stroke={LAYOUT}
        strokeWidth={2}
      />
      <g
        className="stroke-fd-foreground"
        strokeWidth={2}>
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
        zoomed about ×{fmt(zoom, 2)}
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
 * Relative vs. global positioning when the target tag is not where the field layout says. Shows the scene and the
 * error in the scoring point each method computes, over 300 noisy solves.
 */
export const RelativeVsGlobal = () => {
  const [distance, setDistance] = useState(3);
  const [shift, setShift] = useState(0.03);
  const [twist, setTwist] = useState(0);
  const [noise, setNoise] = useState(0.5);

  const params = useDeferredValue({ distance, shift, twist, noise });
  const r = useMemo(
    () =>
      relativeVsGlobal({
        distance: params.distance,
        fieldShift: params.shift,
        fieldTwistDeg: params.twist,
        noisePx: params.noise,
        trials: 300,
      }),
    [params]
  );
  const scene = useMemo(
    () => relativeGlobalScene(params.distance, params.shift, params.twist),
    [params.distance, params.shift, params.twist]
  );

  return (
    <Widget title="Relative vs. global: error at the scoring point">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Distance to the target tag"
          value={distance}
          min={2}
          max={5}
          step={0.1}
          format={(v) => `${fmt(v)} m`}
          onChange={setDistance}
        />
        <Slider
          label="Target tag shifted from the layout (sideways)"
          value={shift}
          min={0}
          max={0.1}
          step={0.005}
          format={(v) => `${fmt(v * 100)} cm`}
          onChange={setShift}
        />
        <Slider
          label="Target tag turned from the layout"
          value={twist}
          min={0}
          max={5}
          step={0.25}
          format={(v) => `${fmt(v)}°`}
          onChange={setTwist}
        />
        <Slider
          label="Corner noise"
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
            <ErrorView
              scene={scene}
              relative={r.relative}
              global={r.global}
            />
            <figcaption className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: RELATIVE }}
                />
                Relative (target tag only)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: GLOBAL }}
                />
                Global (two tags, field layout, gyro heading)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-fd-foreground">+</span>
                True scoring point
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 border-2"
                  style={{ borderColor: LAYOUT }}
                />
                Layout scoring point
              </span>
            </figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout
              label="Relative: bias"
              value={fmt(r.relativeBias * 100, 2)}
              unit="cm"
            />
            <Readout
              label="Relative: spread (RMS)"
              value={fmt(r.relativeSpread * 100, 2)}
              unit="cm"
            />
            <Readout
              label="Global: bias"
              value={fmt(r.globalBias * 100, 2)}
              unit="cm"
            />
            <Readout
              label="Global: spread (RMS)"
              value={fmt(r.globalSpread * 100, 2)}
              unit="cm"
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-fd-muted-foreground">The tags don&apos;t fit in the camera&apos;s view.</p>
      )}
      <p className="text-xs text-fd-muted-foreground">
        Top-down view, to scale except that tags are drawn larger. The solid bar is where the target tag really is. The
        green dashed bar is where the field layout says it is. The inset zooms in around the true scoring point (the
        cross): 0.5 m out from the real tag, where the robot should go. The layout scoring point (the green square) is
        0.5 m out from where the layout says the tag is. A robot with a perfect field pose would go there, because it
        takes the target from the layout. Each dot is one solve&apos;s estimate of the scoring point, in the same
        orientation as the scene (forward to the right, left up). Bias is how far the average lands from the truth.
        Spread is the scatter around that average. The camera is the same one used on the pose estimation page, with no
        lens distortion.
      </p>
    </Widget>
  );
};
