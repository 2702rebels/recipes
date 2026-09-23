"use client";

import { useMemo, useState } from "react";

import { cameraLookingAlong, cameraYaw, DEFAULT_CAMERA, focalFromFov, TAG_SIZE } from "@/lib/vision";
import { planarAmbiguity } from "@/lib/vision-sims";

import { fmt, Readout, Slider, Widget } from "./controls";
import { px, Quad, TagInImage } from "./vision-views";

import type { CameraPose, Intrinsics, Tag } from "@/lib/vision";

const DEG = Math.PI / 180;
const CAMERA_HEIGHT = 0.4;
const TAG_HEIGHT = 0.5;
/** Beyond this distance to the tag (m), the tag is drawn over the principal point cross instead of under it. */
const CROSS_ON_TOP_MAX_RANGE = 3;

/** Top-down sketch: the tag, the true camera, and the camera pose of the second solution. Meters, x to the right. */
const TopDown = ({ tag, cam, alt, hfov }: { tag: Tag; cam: CameraPose; alt: CameraPose | null; hfov: number }) => {
  // Frame the scene around the camera and the tag. The camera looks right (+x), and +y (left of the camera) is up.
  const xs = [0, tag.center[0], ...(alt ? [alt.c[0]] : [])];
  const ys = [0, tag.center[1], ...(alt ? [alt.c[1]] : [])];
  const minX = Math.min(...xs) - 0.6;
  const maxX = Math.max(...xs) + 0.6;
  const minY = Math.min(...ys) - 0.8;
  const maxY = Math.max(...ys) + 0.8;
  const W = 420;
  const k = Math.min(W / (maxX - minX), 260 / (maxY - minY));
  const H = (maxY - minY) * k;
  const sx = (x: number) => px((x - minX) * k + (W - (maxX - minX) * k) / 2);
  const sy = (y: number) => px((maxY - y) * k);
  const half = (TAG_SIZE / 2) * 3; // Drawn three times larger so it stays visible.
  const right = [-Math.sin(tag.yaw), Math.cos(tag.yaw)];

  const cameraMark = (pose: CameraPose, color: string, label: string) => {
    const yaw = cameraYaw(pose);
    const [x, y] = [pose.c[0], pose.c[1]];
    const reach = 0.5;
    const a = yaw + (hfov / 2) * DEG;
    const b = yaw - (hfov / 2) * DEG;
    return (
      <g>
        <path
          d={`M${sx(x)},${sy(y)} L${sx(x + reach * Math.cos(a))},${sy(y + reach * Math.sin(a))} L${sx(x + reach * Math.cos(b))},${sy(y + reach * Math.sin(b))} Z`}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
        />
        <circle
          cx={sx(x)}
          cy={sy(y)}
          r={5}
          fill={color}
        />
        <text
          x={sx(x)}
          y={sy(y) + 18}
          textAnchor="middle"
          fill={color}
          className="text-[11px]">
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${px(H)}`}
      role="img"
      aria-label="Top-down view of the camera, the tag, and the camera position of the second solution"
      className="h-auto w-full">
      {cameraMark(cam, "var(--color-plot-1)", "true camera")}
      {alt && cameraMark(alt, "var(--color-plot-2)", "second solution")}
      <line
        x1={sx(tag.center[0] - right[0] * half)}
        y1={sy(tag.center[1] - right[1] * half)}
        x2={sx(tag.center[0] + right[0] * half)}
        y2={sy(tag.center[1] + right[1] * half)}
        className="stroke-fd-foreground"
        strokeWidth={5}
      />
      <line
        x1={sx(tag.center[0])}
        y1={sy(tag.center[1])}
        x2={sx(tag.center[0] + 0.3 * Math.cos(tag.yaw))}
        y2={sy(tag.center[1] + 0.3 * Math.sin(tag.yaw))}
        className="stroke-fd-muted-foreground"
        strokeWidth={2}
      />
      <text
        x={sx(tag.center[0])}
        y={sy(tag.center[1]) - 12}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        tag (not to scale)
      </text>
    </svg>
  );
};

/**
 * A virtual camera looking at one tag. Shows where the corners land in the image, how many pixels the tag spans, and
 * the second pose that explains the same corners almost as well (the planar ambiguity).
 */
export const PinholeExplorer = () => {
  const [distance, setDistance] = useState(3);
  const [lateral, setLateral] = useState(0);
  const [yawDeg, setYawDeg] = useState(20);
  const [hfov, setHfov] = useState(70);

  const K: Intrinsics = useMemo(() => {
    const f = focalFromFov(hfov, DEFAULT_CAMERA.width);
    return { ...DEFAULT_CAMERA, fx: f, fy: f };
  }, [hfov]);
  const cam = useMemo(() => cameraLookingAlong([0, 0, CAMERA_HEIGHT], 0), []);
  const tag: Tag = useMemo(
    () => ({ center: [distance, lateral, TAG_HEIGHT], yaw: Math.PI + yawDeg * DEG }),
    [distance, lateral, yawDeg]
  );
  const amb = useMemo(() => planarAmbiguity(K, cam, tag), [K, cam, tag]);

  const range = Math.hypot(distance, lateral);
  const widthPx = amb.pixels
    ? Math.hypot(amb.pixels[1][0] - amb.pixels[0][0], amb.pixels[1][1] - amb.pixels[0][1])
    : NaN;
  const altShift = amb.alternate
    ? Math.hypot(amb.alternate.pose.c[0] - cam.c[0], amb.alternate.pose.c[1] - cam.c[1])
    : NaN;

  // Up close the tag covers the image center, so the principal point cross goes on top to stay visible. Farther
  // away the tag is small and the cross would hide it, so the tag goes on top instead.
  const crossOnTop = range <= CROSS_ON_TOP_MAX_RANGE;
  const tagLayer = amb.pixels && (
    <>
      <TagInImage
        K={K}
        cam={cam}
        tag={tag}
      />
      {amb.alternate && (
        <Quad
          pixels={amb.alternate.pixels}
          color="var(--color-plot-2)"
          dashed
        />
      )}
    </>
  );
  // The halo in the image background color keeps the cross readable over both black and white cells.
  const crossPath = `M${K.cx - 24},${K.cy} H${K.cx + 24} M${K.cx},${K.cy - 24} V${K.cy + 24}`;
  const crossLayer = (
    <g strokeLinecap="round">
      <path
        d={crossPath}
        className="stroke-fd-muted"
        strokeWidth={9}
      />
      <path
        d={crossPath}
        stroke="var(--color-plot-4)"
        strokeWidth={4}
      />
    </g>
  );

  return (
    <Widget title="Pinhole camera: what the solver sees">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Distance to tag"
          value={distance}
          min={0.75}
          max={7}
          step={0.05}
          format={(v) => `${fmt(v)} m`}
          onChange={setDistance}
        />
        <Slider
          label="Tag offset to the left"
          value={lateral}
          min={-1.5}
          max={1.5}
          step={0.05}
          format={(v) => `${fmt(v)} m`}
          onChange={setLateral}
        />
        <Slider
          label="Tag turned from facing the camera"
          value={yawDeg}
          min={-60}
          max={60}
          step={1}
          format={(v) => `${v}°`}
          onChange={setYawDeg}
        />
        <Slider
          label="Horizontal field of view"
          value={hfov}
          min={40}
          max={100}
          step={1}
          format={(v) => `${v}° (f = ${fmt(focalFromFov(v, DEFAULT_CAMERA.width))} px)`}
          onChange={setHfov}
        />
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[3fr_2fr]">
        <figure className="m-0">
          <svg
            viewBox={`0 0 ${K.width} ${K.height}`}
            role="img"
            aria-label="Camera image with the tag as the camera sees it"
            className="h-auto w-full rounded-md border border-fd-border bg-fd-muted">
            {crossOnTop ? (
              <>
                {tagLayer}
                {crossLayer}
              </>
            ) : (
              <>
                {crossLayer}
                {tagLayer}
              </>
            )}
            {!amb.pixels && (
              <text
                x={K.width / 2}
                y={K.height / 2}
                textAnchor="middle"
                className="fill-fd-muted-foreground text-[40px]">
                Tag is outside the image
              </text>
            )}
          </svg>
          <figcaption className="mt-1 text-xs text-fd-muted-foreground">
            The {K.width}×{K.height} image. The blue cross marks the principal point. Dashed: the corners the second
            solution predicts. They sit almost on top of the real ones.
          </figcaption>
        </figure>
        <TopDown
          tag={tag}
          cam={cam}
          alt={amb.alternate?.pose ?? null}
          hfov={hfov}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout
          label="Tag width in the image"
          value={fmt(widthPx)}
          unit="px"
        />
        <Readout
          label="Range change for 1 px of width"
          value={fmt((range / widthPx) * 100)}
          unit="cm"
        />
        <Readout
          label="Second solution's reprojection error"
          value={amb.alternate ? fmt(amb.alternate.rmsError, 2) : "none"}
          unit={amb.alternate ? "px" : undefined}
          emphasis
        />
        <Readout
          label="Second solution moves the camera"
          value={amb.alternate ? fmt(altShift) : "—"}
          unit="m"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        The true pose reprojects with zero error. If corner noise is about as large as the second solution&apos;s error,
        the solver can pick either one. The camera is 0.4 m high and the tag center 0.5 m high. There is no lens
        distortion and no noise.
      </p>
    </Widget>
  );
};
