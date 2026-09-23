import { project, TAG_PATTERN, tagPoint, TAG_SIZE } from "@/lib/vision";

import type { CameraPose, Intrinsics, Pixel, Tag, Vec3 } from "@/lib/vision";

/**
 * Rounds an SVG coordinate to 0.1 px. Server and browser can differ in the last digits of floating-point math, and
 * rounding keeps the server-rendered attributes identical to the client's so hydration matches.
 */
export const px = (v: number) => Math.round(v * 10) / 10;

/** Rounds up to 1, 2, or 5 times a power of ten. */
export const niceCeil = (v: number) => {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * mag >= v) ?? 10) * mag;
};

/** Value below which a fraction `q` of `xs` falls. */
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const polygon = (pts: (Pixel | null)[]) =>
  pts.every(Boolean) ? (pts as Pixel[]).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") : "";

interface TagInImageProps {
  K: Intrinsics;
  cam: CameraPose;
  tag: Tag;
  /** Replaces the pinhole projection, for example with a rolling-shutter capture. Defaults to `project(K, cam, p)`. */
  capture?: (p: Vec3) => Pixel | null;
  /** Opacity of the whole tag, for layering several captures into a motion blur. */
  opacity?: number;
}

/**
 * Draws a tag as the camera sees it, cell by cell: the white border, the black border, and the illustrative data bits
 * from {@link TAG_PATTERN}. Coordinates are image pixels, so place it inside an SVG whose viewBox is the image size.
 */
export const TagInImage = ({ K, cam, tag, capture, opacity }: TagInImageProps) => {
  const to = capture ?? ((p: Vec3) => project(K, cam, p));
  const size = tag.size ?? TAG_SIZE;
  // The black square is 8 cells across; the white border adds one more cell on each side.
  const cell = size / 8;
  const quad = (a0: number, b0: number, a1: number, b1: number) =>
    polygon([
      to(tagPoint(tag, a0, b0)),
      to(tagPoint(tag, a1, b0)),
      to(tagPoint(tag, a1, b1)),
      to(tagPoint(tag, a0, b1)),
    ]);
  const cells: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const border = row === 0 || row === 7 || col === 0 || col === 7;
      if (!border && !TAG_PATTERN[row - 1][col - 1]) continue;
      const a0 = -size / 2 + col * cell;
      const b1 = size / 2 - row * cell;
      cells.push(quad(a0, b1 - cell, a0 + cell, b1));
    }
  }
  const outer = size / 2 + cell;
  return (
    <g opacity={opacity}>
      <polygon
        points={quad(-outer, -outer, outer, outer)}
        fill="var(--color-tag-paper)"
        stroke="var(--color-plot-muted)"
        strokeWidth={0.5}
      />
      {cells.map((p, i) => (
        <polygon
          key={i}
          points={p}
          fill="var(--color-tag-ink)"
          stroke="var(--color-tag-ink)"
          strokeWidth={0.4}
        />
      ))}
    </g>
  );
};

/** Outline through four image points, for drawing a solved or alternate tag pose on top of the image. */
export const Quad = ({ pixels, color, dashed }: { pixels: Pixel[]; color: string; dashed?: boolean }) => (
  <polygon
    points={polygon(pixels)}
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeDasharray={dashed ? "6 4" : undefined}
  />
);

/** Maps world meters to SVG pixels for a top-down view, with +y (left) up. `k` is pixels per meter. */
export interface TopDownMap {
  sx: (x: number) => number;
  sy: (y: number) => number;
  k: number;
}

/** Tags in top-down views are drawn this much larger than life so they stay visible. Positions stay to scale. */
export const TAG_DRAW_SCALE = 1.6;

interface TopDownTagProps {
  tag: Tag;
  map: TopDownMap;
  /** CSS color for the fill and outline. */
  color: string;
  fillOpacity?: number;
  dashed?: boolean;
  /** Draw a short tick out of the tag's face, showing which way it faces. */
  tick?: boolean;
}

/**
 * A tag seen from above: a thin bar along its face. The fill is semi-transparent, so a tag drawn on top of another
 * (for example, where the field layout says a tag is) stays visible.
 */
export const TopDownTag = ({ tag, map, color, fillOpacity = 0.35, dashed, tick }: TopDownTagProps) => {
  const halfLength = ((tag.size ?? TAG_SIZE) / 2) * TAG_DRAW_SCALE * map.k;
  const halfThick = 3.5;
  // Screen directions along the face and out of it (screen y points down).
  const along = [-Math.sin(tag.yaw), -Math.cos(tag.yaw)];
  const out = [Math.cos(tag.yaw), -Math.sin(tag.yaw)];
  const x = map.sx(tag.center[0]);
  const y = map.sy(tag.center[1]);
  const corner = (a: number, b: number) =>
    `${px(x + a * halfLength * along[0] + b * halfThick * out[0])},${px(y + a * halfLength * along[1] + b * halfThick * out[1])}`;
  return (
    <g>
      <polygon
        points={[corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].join(" ")}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "3 2" : undefined}
      />
      {tick && (
        <line
          x1={x}
          y1={y}
          x2={map.sx(tag.center[0] + 0.18 * Math.cos(tag.yaw))}
          y2={map.sy(tag.center[1] + 0.18 * Math.sin(tag.yaw))}
          stroke="var(--color-plot-muted)"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
};
