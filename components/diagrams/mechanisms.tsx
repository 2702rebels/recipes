import type { ReactNode } from "react";

import { Figure } from "./vision";

const INK = "var(--color-fd-foreground)";
const MUTED = "var(--color-plot-muted)";
const METAL = "var(--color-metal)";
const MOTION = "var(--color-plot-4)";
const GRAVITY = "var(--color-plot-2)";
const PIECE = "var(--color-plot-3)";
const PANEL_FILL = "var(--color-plot-muted)";

/** SVG arrowhead marker. Each diagram gives its own `id` so markers don't collide on a page. */
const Arrowhead = ({ id, color }: { id: string; color: string }) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX="8"
    refY="5"
    markerWidth="6"
    markerHeight="6"
    orient="auto-start-reverse">
    <path
      d="M0,0 L10,5 L0,10 z"
      fill={color}
    />
  </marker>
);

/** A ball game piece. */
const Ball = ({ x, y, r = 8 }: { x: number; y: number; r?: number }) => (
  <circle
    cx={x}
    cy={y}
    r={r}
    fill={PIECE}
    fillOpacity={0.55}
    stroke={PIECE}
  />
);

const TYPE_W = 176;
const BASE = 160;

/** A straight arrow from `(x1, y1)` to `(x2, y2)`. */
const Arrow = ({
  x1,
  y1,
  x2,
  y2,
  color,
  marker,
  both,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  marker: string;
  both?: boolean;
}) => (
  <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke={color}
    strokeWidth={2.5}
    strokeLinecap="round"
    markerEnd={`url(#${marker})`}
    markerStart={both ? `url(#${marker})` : undefined}
  />
);

/** A curved arrow around `(cx, cy)` from angle `a0` to `a1` (degrees, clockwise from +x on screen). */
const ArcArrow = ({
  cx,
  cy,
  r,
  a0,
  a1,
  marker,
  both,
}: {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  /** Arrowhead marker id. Leave out for a plain arc. */
  marker?: string;
  both?: boolean;
}) => {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return (
    <path
      d={`M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`}
      fill="none"
      stroke={marker ? MOTION : MUTED}
      strokeWidth={marker ? 2.5 : 1.5}
      markerEnd={marker && `url(#${marker})`}
      markerStart={marker && both ? `url(#${marker})` : undefined}
    />
  );
};

/** The five mechanism types used for tuning, each with what is controlled and how gravity acts on it. */
export const MechanismTypes = () => {
  const panels: { title: string; sub: string; sub2: string; body: ReactNode }[] = [
    {
      title: "Flywheel",
      sub: "Controls speed",
      sub2: "No gravity",
      body: (
        <g>
          <circle
            cx={88}
            cy={92}
            r={34}
            fill={PANEL_FILL}
            fillOpacity={0.2}
            stroke={INK}
            strokeWidth={1.5}
          />
          <circle
            cx={88}
            cy={92}
            r={4}
            fill={INK}
          />
          <ArcArrow
            cx={88}
            cy={92}
            r={46}
            a0={200}
            a1={330}
            marker="mt-motion"
          />
          <Ball
            x={142}
            y={66}
          />
        </g>
      ),
    },
    {
      title: "Turret",
      sub: "Controls angle",
      sub2: "No gravity (top view)",
      body: (
        <g>
          <circle
            cx={88}
            cy={92}
            r={36}
            fill="none"
            stroke={METAL}
            strokeWidth={4}
          />
          <rect
            x={76}
            y={82}
            width={60}
            height={20}
            rx={4}
            transform="rotate(-30 88 92)"
            fill={PANEL_FILL}
            fillOpacity={0.3}
            stroke={INK}
            strokeWidth={1.5}
          />
          <circle
            cx={88}
            cy={92}
            r={4}
            fill={INK}
          />
          <ArcArrow
            cx={88}
            cy={92}
            r={50}
            a0={-80}
            a1={10}
            marker="mt-motion"
            both
          />
        </g>
      ),
    },
    {
      title: "Arm",
      sub: "Controls angle",
      sub2: "Gravity varies as cos θ",
      body: (
        <g>
          <line
            x1={40}
            y1={140}
            x2={40}
            y2={112}
            stroke={METAL}
            strokeWidth={6}
          />
          <line
            x1={40}
            y1={110}
            x2={136}
            y2={70}
            stroke={MOTION}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <circle
            cx={40}
            cy={110}
            r={5}
            fill="var(--color-fd-card)"
            stroke={MOTION}
            strokeWidth={2}
          />
          <line
            x1={40}
            y1={110}
            x2={100}
            y2={110}
            stroke={MUTED}
            strokeDasharray="3 3"
          />
          <ArcArrow
            cx={40}
            cy={110}
            r={34}
            a0={-21}
            a1={-1}
          />
          <text
            x={78}
            y={104}
            className="fill-fd-foreground text-xs italic">
            θ
          </text>
          <Arrow
            x1={110}
            y1={84}
            x2={110}
            y2={124}
            color={GRAVITY}
            marker="mt-gravity"
          />
          <ArcArrow
            cx={40}
            cy={110}
            r={100}
            a0={-38}
            a1={-8}
            marker="mt-motion"
            both
          />
        </g>
      ),
    },
    {
      title: "Elevator",
      sub: "Controls height",
      sub2: "Constant gravity",
      body: (
        <g>
          {[62, 114].map((x) => (
            <line
              key={x}
              x1={x}
              y1={30}
              x2={x}
              y2={144}
              stroke={METAL}
              strokeWidth={5}
            />
          ))}
          <rect
            x={66}
            y={70}
            width={44}
            height={28}
            rx={3}
            fill={PANEL_FILL}
            fillOpacity={0.3}
            stroke={INK}
            strokeWidth={1.5}
          />
          <Arrow
            x1={140}
            y1={66}
            x2={140}
            y2={36}
            color={MOTION}
            marker="mt-motion"
          />
          <Arrow
            x1={140}
            y1={102}
            x2={140}
            y2={132}
            color={MOTION}
            marker="mt-motion"
          />
          <Arrow
            x1={88}
            y1={100}
            x2={88}
            y2={134}
            color={GRAVITY}
            marker="mt-gravity"
          />
        </g>
      ),
    },
    {
      title: "Linear deployment",
      sub: "Controls position",
      sub2: "Short, between hard stops",
      body: (
        <g>
          <line
            x1={28}
            y1={112}
            x2={148}
            y2={112}
            stroke={METAL}
            strokeWidth={5}
          />
          {[28, 148].map((x) => (
            <rect
              key={x}
              x={x - 4}
              y={86}
              width={8}
              height={30}
              fill={INK}
            />
          ))}
          <rect
            x={48}
            y={88}
            width={40}
            height={20}
            rx={3}
            fill={PANEL_FILL}
            fillOpacity={0.3}
            stroke={INK}
            strokeWidth={1.5}
          />
          <Arrow
            x1={58}
            y1={70}
            x2={132}
            y2={70}
            color={MOTION}
            marker="mt-motion"
            both
          />
        </g>
      ),
    },
  ];
  return (
    <Figure
      caption={
        <>
          The five mechanism types, by what the controller holds and how gravity loads the motor. Blue arrows show the
          motion, orange arrows the gravity load. Almost every mechanism on an FRC robot tunes like one of these.
        </>
      }>
      <svg
        viewBox={`0 0 ${TYPE_W * 5} 220`}
        role="img"
        aria-label="Flywheel, turret, arm, elevator, and linear deployment, with their motion and gravity loads"
        className="mx-auto h-auto w-full max-w-4xl">
        <defs>
          <Arrowhead
            id="mt-motion"
            color={MOTION}
          />
          <Arrowhead
            id="mt-gravity"
            color={GRAVITY}
          />
        </defs>
        {panels.map((p, i) => (
          <g
            key={p.title}
            transform={`translate(${i * TYPE_W} 0)`}>
            {p.body}
            <text
              x={TYPE_W / 2}
              y={BASE + 16}
              textAnchor="middle"
              className="fill-fd-foreground text-sm font-semibold">
              {p.title}
            </text>
            <text
              x={TYPE_W / 2}
              y={BASE + 36}
              textAnchor="middle"
              className="fill-fd-muted-foreground text-[13px]">
              {p.sub}
            </text>
            <text
              x={TYPE_W / 2}
              y={BASE + 54}
              textAnchor="middle"
              className="fill-fd-muted-foreground text-[13px]">
              {p.sub2}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
};
