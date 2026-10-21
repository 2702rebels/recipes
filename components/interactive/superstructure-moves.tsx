"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  collision,
  DEFAULT_SPEEDS,
  extension,
  GEOMETRY,
  pivotZ,
  PRESETS,
  REEF_LEVELS,
  SAFE_ELEVATOR,
  simulateMove,
  tip,
  TUCK,
  type Collision,
  type Move,
  type Pose,
  type PresetId,
  type Strategy,
} from "@/lib/superstructure";

import { ActionButton, fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { px } from "./vision-views";

/** Real-time slowdown of the playback, so a 0.2 s move is easy to follow. */
const SLOWDOWN = 6;
/** Pixels per inch in the side view. */
const K = 5;
const X_MIN = -20;
const X_MAX = 40;
const Z_MAX = 90;
const W = (X_MAX - X_MIN) * K;
const H = (Z_MAX + 4) * K;
const sx = (x: number) => px((x - X_MIN) * K);
const sz = (z: number) => px((Z_MAX - z) * K);

const ARM = "var(--color-plot-1)";
const HIT = "var(--color-plot-2)";
const METAL = "var(--color-metal)";
const MUTED = "var(--color-plot-muted)";

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "together", label: "Both at once" },
  { value: "sequence", label: "One at a time" },
  { value: "interlock", label: "Interlock" },
];

const HIT_NAMES: Record<Exclude<Collision, null>, string> = {
  intake: "the intake",
  drivetrain: "the drivetrain",
  carpet: "the carpet",
};

const duration = (m: Move) => (m.poses.length - 1) * m.dt;

const INK = "var(--color-fd-foreground)";
const CARD = "var(--color-fd-card)";
const BUMPER = "var(--color-bumper)";
const CORAL = "var(--color-coral)";
const POLY = "var(--color-plot-4)";

/** A rectangle between two corners in model inches. */
const Rect = ({
  x0,
  x1,
  z0,
  z1,
  rx = 0,
  fill = METAL,
  opacity = 1,
  strokeOpacity = 0.55,
}: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  rx?: number;
  fill?: string;
  opacity?: number;
  strokeOpacity?: number;
}) => (
  <rect
    x={sx(Math.min(x0, x1))}
    y={sz(Math.max(z0, z1))}
    width={px(Math.abs(x1 - x0) * K)}
    height={px(Math.abs(z1 - z0) * K)}
    rx={rx * K}
    fill={fill}
    fillOpacity={opacity}
    stroke={INK}
    strokeOpacity={strokeOpacity}
    strokeLinejoin="round"
  />
);

/** A round part seen end-on (wheel, roller, motor) with a shaft in the middle. */
const Hub = ({
  x,
  z,
  r,
  fill = MUTED,
  opacity = 0.6,
}: {
  x: number;
  z: number;
  r: number;
  fill?: string;
  opacity?: number;
}) => (
  <g>
    <circle
      cx={sx(x)}
      cy={sz(z)}
      r={r * K}
      fill={fill}
      fillOpacity={opacity}
      stroke={INK}
      strokeOpacity={0.7}
    />
    <circle
      cx={sx(x)}
      cy={sz(z)}
      r={Math.min(0.35, r * 0.3) * K}
      fill={INK}
      fillOpacity={0.6}
    />
  </g>
);

/** A vertical frame tube with a row of holes. */
const Tube = ({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) => (
  <g>
    <Rect
      x0={x0}
      x1={x1}
      z0={z0}
      z1={z1}
      strokeOpacity={0.7}
    />
    {Array.from({ length: Math.max(0, Math.floor((z1 - z0) / 2) - 1) }, (_, i) => (
      <circle
        key={i}
        cx={sx((x0 + x1) / 2)}
        cy={sz(z0 + 2 + 2 * i)}
        r={0.9}
        fill={CARD}
        fillOpacity={0.9}
      />
    ))}
  </g>
);

/**
 * The arm and its end effector, drawn in the arm's own frame: x along the arm from the pivot, y across it. The roller
 * end effector runs from 12.6 in out to the tip, the point the model checks for contact.
 */
const Arm = ({ pose, color, ghost }: { pose: Pose; color: string; ghost?: boolean }) => {
  const L = GEOMETRY.armLength;
  const u = (v: number) => px(v * K);
  return (
    <g
      transform={`translate(${sx(GEOMETRY.pivotX)} ${sz(pivotZ(pose))}) rotate(${-pose.arm})`}
      opacity={ghost ? 0.45 : 1}
      strokeDasharray={ghost ? "4 3" : undefined}>
      {/* Arm plate with lightening holes. */}
      <rect
        x={u(-1.1)}
        y={u(-1.1)}
        width={u(15.1)}
        height={u(2.2)}
        rx={u(1.1)}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={1.5}
      />
      {[4, 8.5].map((h) => (
        <circle
          key={h}
          cx={u(h)}
          cy={0}
          r={u(0.5)}
          fill={CARD}
          stroke={color}
          strokeOpacity={0.6}
        />
      ))}
      {/* End effector: side plate and two pairs of rollers. */}
      <rect
        x={u(12.6)}
        y={u(-1.9)}
        width={u(L - 12.6)}
        height={u(3.8)}
        rx={u(0.4)}
        fill={METAL}
        stroke={ghost ? color : INK}
        strokeOpacity={0.7}
      />
      {[14.6, 18.4].flatMap((r) =>
        [-1.1, 1.1].map((v) => (
          <circle
            key={`${r}${v}`}
            cx={u(r)}
            cy={u(v)}
            r={u(0.75)}
            fill={MUTED}
            fillOpacity={0.6}
            stroke={INK}
            strokeOpacity={0.7}
          />
        ))
      )}
      {/* Pivot. */}
      <circle
        r={u(0.7)}
        fill={CARD}
        stroke={color}
        strokeWidth={2}
      />
    </g>
  );
};

/**
 * One 2025 reef pipe (in): the trunk, the L2 and L3 branches that tilt up 35° toward the robot, and the jog at `bend`
 * to the L4 post.
 */
const REEF = { trunk: 33.1, bend: 56, post: 23, branchTip: 23.5 };

const TAN35 = Math.tan((35 * Math.PI) / 180);

/** Height (in) where a branch with its tip at `z` meets the trunk. */
const branchRootZ = (z: number) => z - (REEF.trunk - REEF.branchTip) * TAN35;

const reefPath = () => {
  const jogTop = REEF.bend + (REEF.trunk - REEF.post) * TAN35;
  const branches = REEF_LEVELS.filter((l) => l.label !== "L4").map(
    (l) => `M${sx(REEF.branchTip)},${sz(l.z)} L${sx(REEF.trunk)},${sz(branchRootZ(l.z))}`
  );
  // Round caps add half the pipe width at each end, so the trunk stops that much short of the carpet and 72 in.
  const trunk =
    `M${sx(REEF.trunk)},${sz(0.83)} L${sx(REEF.trunk)},${sz(REEF.bend)} ` +
    `L${sx(REEF.post)},${sz(jogTop)} L${sx(REEF.post)},${sz(72 - 0.83)}`;
  return [trunk, ...branches].join(" ");
};

/** Side view of the robot, the reef, the path of the tip, and the first contact. */
const SideView = ({ pose, move, played }: { pose: Pose; move: Move | null; played: number }) => {
  const g = GEOMETRY;
  const outer = g.frame + g.bumper;
  const hitNow = collision(pose);
  const hitPose = move && move.hitIndex >= 0 && move.hitIndex <= played ? move.poses[move.hitIndex] : null;
  const highlight = hitNow ?? (hitPose ? move!.hit : null);
  const trace = move ? move.poses.slice(0, played + 1).map(tip) : [];
  const segments = trace.slice(1).map((p, j) => ({
    a: trace[j],
    b: p,
    hit: collision(move!.poses[j + 1]) !== null,
  }));
  const safeZ = g.pivotBase + SAFE_ELEVATOR;
  const pz = pivotZ(pose);
  const stageTop = pz + 3;
  const intake = g.intake;
  const intakeHit = highlight === "intake";
  const bodyHit = highlight === "drivetrain";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Side view of a robot with an elevator and a pivoting arm, an intake in front of the elevator, and a 2025 reef pole"
      className="mx-auto h-auto w-full max-w-xs rounded-lg border border-fd-border">
      {/* The reef, faded. One path, so the stroke paints once and the joints don't darken. */}
      <path
        d={reefPath()}
        fill="none"
        stroke={MUTED}
        strokeOpacity={0.35}
        strokeWidth={1.66 * K}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Level labels on the far side of the pole, clear of the arm's path. */}
      {REEF_LEVELS.map((l) => (
        <text
          key={l.label}
          x={sx((l.label === "L4" ? REEF.post : REEF.trunk) + 1.6)}
          y={sz(l.label === "L4" ? l.z - 2 : branchRootZ(l.z))}
          textAnchor="start"
          dominantBaseline="central"
          className="fill-fd-muted-foreground text-[11px]">
          {l.label}
        </text>
      ))}

      {/* Carpet: a shaded band with diagonal hatching under the surface line. */}
      <rect
        x={0}
        y={sz(0)}
        width={W}
        height={H - sz(0)}
        fill={MUTED}
        fillOpacity={0.12}
      />
      <path
        d={Array.from({ length: Math.ceil(W / 7) + 3 }, (_, i) => `M${i * 7},${sz(0)} l-9,9`).join(" ")}
        stroke={MUTED}
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      <line
        x1={0}
        x2={W}
        y1={sz(0)}
        y2={sz(0)}
        stroke={INK}
        strokeOpacity={0.7}
        strokeWidth={1.5}
      />

      {/* Drivetrain: frame rail and wheels. The bumper is drawn later, over the wheels. */}
      <Rect
        x0={-g.frame}
        x1={g.frame}
        z0={6.5}
        z1={g.bodyTop}
        fill={bodyHit ? HIT : METAL}
        strokeOpacity={0.7}
      />
      {[-9, 9].map((x) => (
        <Hub
          key={x}
          x={x}
          z={2}
          r={2}
          opacity={0.9}
        />
      ))}

      {/* Intake: side plate, two rollers, and its motor. */}
      <path
        d={
          `M${sx(intake.x0)},${sz(intake.z0)} L${sx(intake.x1)},${sz(intake.z0)} ` +
          `L${sx(intake.x1)},${sz(intake.z1 - 3)} L${sx(intake.x1 - 3)},${sz(intake.z1)} ` +
          `L${sx(intake.x0)},${sz(intake.z1)} Z`
        }
        fill={intakeHit ? HIT : POLY}
        fillOpacity={intakeHit ? 0.6 : 0.2}
        stroke={intakeHit ? HIT : POLY}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Hub
        x={12.4}
        z={10.4}
        r={1.2}
      />
      <Hub
        x={10.6}
        z={19.6}
        r={1.2}
      />
      <Hub
        x={8.9}
        z={10.4}
        r={1}
        opacity={0.85}
      />
      <text
        x={sx((intake.x0 + intake.x1) / 2)}
        y={sz(15)}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-fd-foreground text-[10px]">
        Intake
      </text>

      {/* Elevator: gearbox, fixed stage, moving stage, and the carriage that carries the arm pivot. */}
      <Rect
        x0={-5}
        x1={-1.5}
        z0={g.bodyTop}
        z1={g.bodyTop + 6}
        rx={0.4}
        opacity={0.35}
      />
      <Hub
        x={-3.25}
        z={g.bodyTop + 1.7}
        r={1.2}
        opacity={0.85}
      />
      <Hub
        x={-3.25}
        z={g.bodyTop + 4.3}
        r={1.2}
        opacity={0.85}
      />
      <Tube
        x0={-1.5}
        x1={0.5}
        z0={g.bodyTop}
        z1={g.bodyTop + 48}
      />
      <Tube
        x0={0.5}
        x1={2.5}
        z0={Math.max(g.bodyTop + 1, stageTop - 44)}
        z1={stageTop}
      />
      <Rect
        x0={1.2}
        x1={5.2}
        z0={pz - 3.5}
        z1={pz + 2}
        rx={0.5}
        opacity={0.8}
        strokeOpacity={0.7}
      />
      <line
        x1={sx(-6)}
        x2={sx(8)}
        y1={sz(safeZ)}
        y2={sz(safeZ)}
        stroke={MUTED}
        strokeDasharray="2 3"
      />
      <text
        x={sx(-6.5)}
        y={sz(safeZ)}
        textAnchor="end"
        dominantBaseline="central"
        className="fill-fd-muted-foreground text-[10px]">
        Safe
      </text>

      {/* Bumper with the team number, over the wheels. */}
      <Rect
        x0={-outer}
        x1={outer}
        z0={g.bumperBottom}
        z1={6.8}
        rx={1}
        fill={bodyHit ? HIT : BUMPER}
        strokeOpacity={0.6}
      />
      <text
        x={sx(0)}
        y={sz(4.4)}
        textAnchor="middle"
        dominantBaseline="central"
        fill={CORAL}
        className="text-[12px] font-bold tracking-widest">
        2702
      </text>

      {/* Path of the tip during the move, orange where the arm touches something. */}
      {segments.map((s, j) => (
        <line
          key={j}
          x1={sx(s.a[0])}
          y1={sz(s.a[1])}
          x2={sx(s.b[0])}
          y2={sz(s.b[1])}
          stroke={s.hit ? HIT : MUTED}
          strokeWidth={s.hit ? 3 : 1.5}
        />
      ))}
      {hitPose && (
        <Arm
          pose={hitPose}
          color={HIT}
          ghost
        />
      )}
      <Arm
        pose={pose}
        color={hitNow ? HIT : ARM}
      />
    </svg>
  );
};

/**
 * An elevator and a pivoting arm moving between a handoff pose and the 2025 reef levels. Moving both joints at once
 * swings the end effector through the intake. Doing one thing at a time is safe but slow. An interlock that only
 * holds a joint back while it would be unsafe is safe and almost as fast.
 */
export const SuperstructureMoves = () => {
  const [pose, setPose] = useState<Pose>(PRESETS.handoff.pose);
  const [target, setTarget] = useState<PresetId>("l2");
  const [strategy, setStrategy] = useState<Strategy>("together");
  // The move being shown, the pose it started from, and how far through it playback is (0 to 1).
  const [move, setMove] = useState<Move | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(0);

  const start = move ? move.poses[0] : pose;
  const all = useMemo(
    () =>
      Object.fromEntries(
        STRATEGIES.map((s) => [s.value, simulateMove(start, PRESETS[target].pose, s.value)])
      ) as Record<Strategy, Move>,
    [start, target]
  );

  useEffect(() => {
    if (!playing || !move) return;
    const total = duration(move) * SLOWDOWN * 1000;
    let id = 0;
    // The first frame's timestamp can be earlier than performance.now() here, so start timing from that frame.
    let last: number | null = null;
    const tick = (now: number) => {
      const elapsed = last === null ? 0 : Math.max(0, now - last);
      const next = Math.min(1, progressRef.current + elapsed / Math.max(total, 1));
      last = now;
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, move]);

  const played = move
    ? Math.min(move.poses.length - 1, Math.max(0, Math.round(progress * (move.poses.length - 1))))
    : 0;
  const shown = move ? move.poses[played] : pose;

  /** Ends any move on screen and makes `p` the pose the next move starts from. */
  const settle = (p: Pose) => {
    setPlaying(false);
    setMove(null);
    setPose(p);
  };
  const play = () => {
    const m = simulateMove(shown, PRESETS[target].pose, strategy);
    progressRef.current = 0;
    setProgress(0);
    setPose(shown);
    setMove(m);
    setPlaying(true);
  };

  const [, tz] = tip(shown);
  const hitNow = collision(shown);

  return (
    <Widget title="Coordinating an elevator and an arm">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,20rem)_1fr]">
        <SideView
          pose={shown}
          move={move}
          played={played}
        />
        <div className="flex flex-col gap-4">
          <Slider
            label="Elevator travel"
            value={shown.elevator}
            min={0}
            max={GEOMETRY.travel}
            step={0.5}
            format={(v) => `${fmt(v)} in`}
            onChange={(v) => settle({ ...shown, elevator: v })}
          />
          <Slider
            label="Arm angle (from horizontal)"
            value={shown.arm}
            min={TUCK}
            max={90}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => settle({ ...shown, arm: v })}
          />
          <Segmented
            label="Move to"
            value={target}
            onChange={(v) => {
              settle(shown);
              setTarget(v);
            }}
            options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))}
          />
          <Segmented
            label="Coordination"
            value={strategy}
            onChange={(v) => {
              settle(shown);
              setStrategy(v);
            }}
            options={STRATEGIES}
          />
          <div>
            <ActionButton
              primary
              onClick={play}>
              {playing ? "Restart move" : "Play move"}
            </ActionButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Readout
              label="End effector height"
              value={fmt(tz, 3)}
              unit="in"
            />
            <Readout
              label="Reach past the frame"
              value={fmt(extension(shown), 2)}
              unit="in"
            />
          </div>
          <p
            className="text-sm"
            aria-live="polite">
            {hitNow
              ? `In this pose the arm is inside ${HIT_NAMES[hitNow]}.`
              : move && move.hit && move.hitIndex <= played
                ? `The arm hit ${HIT_NAMES[move.hit]} ${fmt(move.hitIndex * move.dt, 2)} s into the move.`
                : "No contact so far."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STRATEGIES.map((s) => {
          const m = all[s.value];
          return (
            <Readout
              key={s.value}
              label={`${s.label} to ${PRESETS[target].label}`}
              value={fmt(duration(m), 2)}
              unit={m.hit ? `s, hits ${HIT_NAMES[m.hit]}` : "s, no contact"}
            />
          );
        })}
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Side view to scale, in inches. The arm is {GEOMETRY.armLength} in long, and the elevator travels{" "}
        {GEOMETRY.travel} in. Each joint moves at a constant top speed ({DEFAULT_SPEEDS.elevator} in/s and{" "}
        {DEFAULT_SPEEDS.arm}°/s) with no acceleration limit, and the model ignores the game piece. Above the dotted safe
        line, the arm can point anywhere without touching the intake. The faded pipe is a 2025 reef pole. The orange
        trace marks where the arm touches something. Playback is slowed {SLOWDOWN}×.
      </p>
    </Widget>
  );
};
