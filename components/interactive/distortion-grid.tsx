"use client";

import { useId, useState } from "react";

import { DEFAULT_CAMERA, distort } from "@/lib/vision";

import { fmt, Readout, Slider, Widget } from "./controls";

const K = DEFAULT_CAMERA;
const LINES = 9;
const SAMPLES = 48;

/**
 * A grid of straight lines as a lens with radial distortion images it. Negative k1 bows lines outward (barrel), positive
 * k1 bows them inward (pincushion). The faint grid is where an ideal pinhole camera would put them.
 */
export const DistortionGrid = () => {
  const [k1, setK1] = useState(-0.15);
  const [k2, setK2] = useState(0);
  const clip = useId();
  const lens = { ...K, k1, k2 };

  // Map an ideal pixel through the distortion model.
  const warp = (u: number, v: number): [number, number] => {
    const [x, y] = distort(lens, (u - K.cx) / K.fx, (v - K.cy) / K.fy);
    return [x * K.fx + K.cx, y * K.fy + K.cy];
  };
  // Grid spans a bit past the image so distorted lines still reach the edges.
  const margin = 0.25;
  const u0 = -K.width * margin;
  const u1 = K.width * (1 + margin);
  const v0 = -K.height * margin;
  const v1 = K.height * (1 + margin);
  const lines: [number, number][][] = [];
  for (let i = 0; i <= LINES + 3; i++) {
    const u = u0 + ((u1 - u0) * i) / (LINES + 3);
    const v = v0 + ((v1 - v0) * i) / (LINES + 3);
    lines.push(Array.from({ length: SAMPLES + 1 }, (_, j): [number, number] => [u, v0 + ((v1 - v0) * j) / SAMPLES]));
    lines.push(Array.from({ length: SAMPLES + 1 }, (_, j): [number, number] => [u0 + ((u1 - u0) * j) / SAMPLES, v]));
  }
  const path = (pts: [number, number][]) =>
    pts.map(([u, v], i) => `${i ? "L" : "M"}${u.toFixed(1)},${v.toFixed(1)}`).join("");

  const corner = warp(K.width, K.height);
  const cornerShift = Math.hypot(corner[0] - K.width, corner[1] - K.height);
  const edge = warp(K.width, K.cy);
  const edgeShift = Math.abs(edge[0] - K.width);

  return (
    <Widget title="Lens distortion: straight lines that bend">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="k1 (main radial term)"
          value={k1}
          min={-0.4}
          max={0.2}
          step={0.01}
          format={(v) => fmt(v, 2)}
          onChange={setK1}
        />
        <Slider
          label="k2 (second radial term)"
          value={k2}
          min={-0.1}
          max={0.1}
          step={0.005}
          format={(v) => fmt(v, 2)}
          onChange={setK2}
        />
      </div>
      <svg
        viewBox={`0 0 ${K.width} ${K.height}`}
        role="img"
        aria-label="Grid of straight lines distorted by the lens model"
        className="h-auto w-full rounded-md border border-fd-border bg-fd-muted">
        <defs>
          <clipPath id={clip}>
            <rect
              width={K.width}
              height={K.height}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          {lines.map((pts, i) => (
            <path
              key={`ideal${i}`}
              d={path(pts)}
              fill="none"
              stroke="var(--color-plot-muted)"
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
          ))}
          {lines.map((pts, i) => (
            <path
              key={`lens${i}`}
              d={path(pts.map(([u, v]) => warp(u, v)))}
              fill="none"
              stroke="var(--color-plot-1)"
              strokeWidth={2.5}
            />
          ))}
        </g>
      </svg>
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label="Shift at the middle of the right edge"
          value={fmt(edgeShift)}
          unit="px"
        />
        <Readout
          label="Shift at the image corner"
          value={fmt(cornerShift)}
          unit="px"
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        The {K.width}×{K.height}, 70° camera from the pose estimation page. The model is radial only (no tangential
        terms). The center of the image never moves. The shift grows quickly toward the edges.
      </p>
    </Widget>
  );
};
