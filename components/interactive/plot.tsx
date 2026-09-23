import { cn } from "@/lib/cn";

/** One line on a {@link LinePlot}. */
export interface PlotSeries {
  /** Legend label. */
  label: string;
  /** Points in data coordinates, sorted by x. */
  points: [number, number][];
  /** CSS color. Use a theme variable such as `var(--color-plot-1)`. */
  color: string;
  /** Draw as a dashed line. */
  dashed?: boolean;
}

/** A shaded region on a {@link LinePlot}, e.g. to mark an unreachable region or a range of the x axis. */
export interface PlotBand {
  /** Polygon in data coordinates. */
  polygon: [number, number][];
  /** CSS fill color. */
  color: string;
  /** Legend label. */
  label: string;
}

/** A labeled reference line across the whole plot, vertical (`x`) or horizontal (`y`). */
export interface PlotMarker {
  x?: number;
  y?: number;
  /** Short label drawn next to the line. */
  label?: string;
  /** CSS color. Defaults to the muted foreground. */
  color?: string;
}

interface LinePlotProps {
  series: PlotSeries[];
  bands?: PlotBand[];
  markers?: PlotMarker[];
  xMax: number;
  /** Lower bound of the y axis. Defaults to 0. */
  yMin?: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  /** Screen-reader description of what the plot shows. */
  ariaLabel: string;
  className?: string;
}

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 12, right: 16, bottom: 40, left: 56 };

/** Picks round tick values between `min` and `max`, about `count` of them. */
function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}

function format(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000 || Math.abs(v) < 0.001) return v.toExponential(0);
  return String(Number(v.toPrecision(3)));
}

/** Minimal dependency-free SVG line plot that follows the site theme. */
export const LinePlot = ({
  series,
  bands = [],
  markers = [],
  xMax,
  yMin = 0,
  yMax,
  xLabel,
  yLabel,
  ariaLabel,
  className,
}: LinePlotProps) => {
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + (Math.min(Math.max(x, 0), xMax) / xMax) * innerW;
  const sy = (y: number) => PAD.top + innerH - ((Math.min(Math.max(y, yMin), yMax) - yMin) / (yMax - yMin)) * innerH;
  const path = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");

  return (
    <figure className={cn("m-0", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full">
        {ticks(yMin, yMax).map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              className={t === 0 && yMin < 0 ? "stroke-fd-muted-foreground/60" : "stroke-fd-border"}
            />
            <text
              x={PAD.left - 8}
              y={sy(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-fd-muted-foreground text-[11px]">
              {format(t)}
            </text>
          </g>
        ))}
        {ticks(0, xMax, 6).map((t) => (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={HEIGHT - PAD.bottom + 16}
            textAnchor="middle"
            className="fill-fd-muted-foreground text-[11px]">
            {format(t)}
          </text>
        ))}
        <text
          x={PAD.left + innerW / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-xs">
          {xLabel}
        </text>
        <text
          transform={`translate(14 ${PAD.top + innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-xs">
          {yLabel}
        </text>
        {bands.map((b) => (
          <path
            key={b.label}
            d={`${path(b.polygon)}Z`}
            fill={b.color}
          />
        ))}
        {markers.map((m, i) => {
          const color = m.color ?? "var(--color-plot-muted)";
          if (m.x !== undefined) {
            const x = sx(m.x);
            return (
              <g key={`m${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke={color}
                  strokeDasharray="3 4"
                />
                {m.label && (
                  <text
                    x={x + 4}
                    y={PAD.top + 10}
                    fill={color}
                    className="text-[11px]">
                    {m.label}
                  </text>
                )}
              </g>
            );
          }
          const y = sy(m.y ?? 0);
          return (
            <g key={`m${i}`}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke={color}
                strokeDasharray="3 4"
              />
              {m.label && (
                <text
                  x={WIDTH - PAD.right - 4}
                  y={y - 4}
                  textAnchor="end"
                  fill={color}
                  className="text-[11px]">
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeDasharray={s.dashed ? "6 5" : undefined}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 px-2 text-xs text-fd-muted-foreground">
        {series.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5">
            <svg
              width="18"
              height="6"
              aria-hidden>
              <line
                x1="0"
                x2="18"
                y1="3"
                y2="3"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray={s.dashed ? "4 3" : undefined}
              />
            </svg>
            {s.label}
          </span>
        ))}
        {bands.map((b) => (
          <span
            key={b.label}
            className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ background: b.color }}
            />
            {b.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
};
