"use client";

import { useState } from "react";

import { MOTORS } from "@/lib/motors";
import {
  desaturate,
  fieldToRobot,
  freeSpeed,
  predictPath,
  rectangleModules,
  rotationCenter,
  toModuleStates,
  type ChassisSpeeds,
} from "@/lib/swerve";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";
import { px } from "./vision-views";

/** Distance between module centers, front to back and side to side (m). */
const MODULE_SPACING = 0.58;
/** Frame drawn around the modules (m). */
const FRAME = 0.76;
const MODULES = rectangleModules(MODULE_SPACING, MODULE_SPACING);
const MODULE_NAMES: Record<string, string> = { FL: "Front left", FR: "Front right", BL: "Back left", BR: "Back right" };
/** Fastest a module can go: a Kraken X60 (FOC) at free speed, 6.75:1, 4 in wheels. */
const MAX_SPEED = freeSpeed({
  motor: MOTORS.x60.foc,
  ratio: 6.75,
  wheelRadius: 0.0508,
  mass: 60,
  mu: 1.1,
  statorLimit: 60,
});
/** Arrow length per unit of module speed (m per m/s). */
const ARROW = 0.16;
/** How far ahead the predicted path runs (s), and the times of the ghost robots along it. */
const GHOSTS = [0.25, 0.5, 0.75];

const VIEW = { minX: -2.5, maxX: 2.5, minY: -1.5, maxY: 1.5 };
const WIDTH = 640;
const K = WIDTH / (VIEW.maxX - VIEW.minX);
const HEIGHT = (VIEW.maxY - VIEW.minY) * K;
const sx = (x: number) => px((x - VIEW.minX) * K);
const sy = (y: number) => px((VIEW.maxY - y) * K);

const ROBOT_COLOR = "var(--color-fd-foreground)";
const MODULE_COLOR = "var(--color-plot-3)";
const PATH_COLOR = "var(--color-plot-2)";
const ICR_COLOR = "var(--color-plot-4)";

/** Turns a robot-frame point into the field frame, for a robot at the origin facing `heading`. */
const toField = (x: number, y: number, heading: number, origin: [number, number] = [0, 0]): [number, number] => [
  origin[0] + x * Math.cos(heading) - y * Math.sin(heading),
  origin[1] + x * Math.sin(heading) + y * Math.cos(heading),
];

/** An arrow from `(x1, y1)` to `(x2, y2)` in field meters, with a head drawn as two short strokes. */
const ArrowLine = ({
  from,
  to,
  color,
  dashed,
  width = 2.5,
}: {
  from: [number, number];
  to: [number, number];
  color: string;
  dashed?: boolean;
  width?: number;
}) => {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (len < 0.01) return null;
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const head = Math.min(0.08, len / 2);
  const wing = (s: number): [number, number] => [
    to[0] - head * Math.cos(a + s * 0.45),
    to[1] - head * Math.sin(a + s * 0.45),
  ];
  const [l, r] = [wing(1), wing(-1)];
  return (
    <g
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none">
      <line
        x1={sx(from[0])}
        y1={sy(from[1])}
        x2={sx(to[0])}
        y2={sy(to[1])}
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      <path d={`M${sx(l[0])},${sy(l[1])} L${sx(to[0])},${sy(to[1])} L${sx(r[0])},${sy(r[1])}`} />
    </g>
  );
};

/** The robot's frame outline at a field pose, with a bar on its front edge. */
const Frame = ({ pose, color, opacity = 1 }: { pose: [number, number, number]; color: string; opacity?: number }) => {
  const [x, y, heading] = pose;
  const h = FRAME / 2;
  const corners = [
    [h, h],
    [h, -h],
    [-h, -h],
    [-h, h],
  ].map(([cx, cy]) => toField(cx, cy, heading, [x, y]));
  const front = [toField(h, h * 0.6, heading, [x, y]), toField(h, -h * 0.6, heading, [x, y])];
  return (
    <g
      stroke={color}
      strokeOpacity={opacity}
      fill="none">
      <path
        d={`${corners.map(([cx, cy], i) => `${i ? "L" : "M"}${sx(cx)},${sy(cy)}`).join("")}Z`}
        strokeWidth={2}
      />
      <line
        x1={sx(front[0][0])}
        y1={sy(front[0][1])}
        x2={sx(front[1][0])}
        y2={sy(front[1][1])}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </g>
  );
};

/**
 * Swerve inverse kinematics on a top-down robot. Sliders set the chassis velocity, either field-relative or
 * robot-relative. Each module shows the speed and direction it is commanded, the requested speed before
 * desaturation, and the center of rotation. A dashed path shows where the robot goes over the next 0.75 s.
 */
export const SwerveKinematics = () => {
  const [frame, setFrame] = useState<"field" | "robot">("field");
  const [vx, setVx] = useState(2);
  const [vy, setVy] = useState(0);
  const [turn, setTurn] = useState(180);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [desat, setDesat] = useState<"on" | "off">("on");

  const heading = (headingDeg * Math.PI) / 180;
  const input: ChassisSpeeds = { vx, vy, omega: (turn * Math.PI) / 180 };
  const fieldRelative = frame === "field";
  const robotSpeeds = fieldRelative ? fieldToRobot(input, heading) : input;
  const requested = toModuleStates(robotSpeeds, MODULES);
  const { states: delivered, scale } =
    desat === "on" ? desaturate(requested, MAX_SPEED) : { states: requested, scale: 1 };
  // Desaturation scales the whole chassis velocity, so the path uses the scaled command.
  const driven: ChassisSpeeds = {
    vx: input.vx * scale,
    vy: input.vy * scale,
    omega: input.omega * scale,
  };
  const path = predictPath(
    driven,
    fieldRelative,
    heading,
    Array.from({ length: 61 }, (_, i) => (i / 60) * GHOSTS[GHOSTS.length - 1])
  );
  const ghosts = predictPath(driven, fieldRelative, heading, GHOSTS);
  const icr = rotationCenter(robotSpeeds);
  const icrField = icr && toField(icr[0], icr[1], heading);
  const icrVisible =
    icrField &&
    icrField[0] > VIEW.minX &&
    icrField[0] < VIEW.maxX &&
    icrField[1] > VIEW.minY &&
    icrField[1] < VIEW.maxY;
  const over = requested.some((s) => s.speed > MAX_SPEED + 1e-9);

  return (
    <Widget title="Swerve kinematics: chassis speeds to module states">
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Driver input"
          value={frame}
          onChange={setFrame}
          options={[
            { value: "field", label: "Field-relative" },
            { value: "robot", label: "Robot-relative" },
          ]}
        />
        <Segmented
          label="Desaturate wheel speeds"
          value={desat}
          onChange={setDesat}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
        <Slider
          label={fieldRelative ? "vx (toward the red wall)" : "vx (robot forward)"}
          value={vx}
          min={-4}
          max={4}
          step={0.1}
          format={(v) => `${fmt(v, 2)} m/s`}
          onChange={setVx}
        />
        <Slider
          label={fieldRelative ? "vy (field left)" : "vy (robot left)"}
          value={vy}
          min={-4}
          max={4}
          step={0.1}
          format={(v) => `${fmt(v, 2)} m/s`}
          onChange={setVy}
        />
        <Slider
          label="ω (turn rate, counterclockwise)"
          value={turn}
          min={-360}
          max={360}
          step={15}
          format={(v) => `${v}°/s`}
          onChange={setTurn}
        />
        <Slider
          label="Robot heading (gyro)"
          value={headingDeg}
          min={-180}
          max={180}
          step={15}
          format={(v) => `${v}°`}
          onChange={setHeadingDeg}
        />
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${px(HEIGHT)}`}
        role="img"
        aria-label="Top-down view of a swerve robot with each module's commanded direction and speed, and the path it will drive"
        className="h-auto w-full rounded-lg border border-fd-border">
        {Array.from({ length: VIEW.maxX - VIEW.minX + 1 }, (_, i) => VIEW.minX + i).map((g) => (
          <line
            key={`x${g}`}
            x1={sx(g)}
            x2={sx(g)}
            y1={0}
            y2={px(HEIGHT)}
            className="stroke-fd-border"
          />
        ))}
        {[-1, 0, 1].map((g) => (
          <line
            key={`y${g}`}
            x1={0}
            x2={WIDTH}
            y1={sy(g)}
            y2={sy(g)}
            className="stroke-fd-border"
          />
        ))}
        {/* Field axes, in the bottom-left corner. */}
        <ArrowLine
          from={[-2.35, -1.35]}
          to={[-1.85, -1.35]}
          color="var(--color-plot-muted)"
          width={1.5}
        />
        <ArrowLine
          from={[-2.35, -1.35]}
          to={[-2.35, -0.85]}
          color="var(--color-plot-muted)"
          width={1.5}
        />
        <text
          x={sx(-1.8)}
          y={sy(-1.35)}
          dominantBaseline="middle"
          className="fill-fd-muted-foreground text-[11px]">
          field +x
        </text>
        <text
          x={sx(-2.29)}
          y={sy(-0.83)}
          className="fill-fd-muted-foreground text-[11px]">
          field +y
        </text>

        <path
          d={path.map(([x, y], i) => `${i ? "L" : "M"}${sx(x)},${sy(y)}`).join("")}
          fill="none"
          stroke={PATH_COLOR}
          strokeWidth={2}
          strokeDasharray="6 5"
        />
        {ghosts.map((pose, i) => (
          <Frame
            key={GHOSTS[i]}
            pose={pose}
            color={PATH_COLOR}
            opacity={0.25 + 0.1 * i}
          />
        ))}

        {icrField && icrVisible && (
          <g>
            {MODULES.map((m) => {
              const [mx, my] = toField(m.x, m.y, heading);
              return (
                <line
                  key={m.name}
                  x1={sx(icrField[0])}
                  y1={sy(icrField[1])}
                  x2={sx(mx)}
                  y2={sy(my)}
                  stroke={ICR_COLOR}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              );
            })}
            <circle
              cx={sx(icrField[0])}
              cy={sy(icrField[1])}
              r={5}
              fill={ICR_COLOR}
            />
          </g>
        )}

        <Frame
          pose={[0, 0, heading]}
          color={ROBOT_COLOR}
        />
        {MODULES.map((m, i) => {
          const center = toField(m.x, m.y, heading);
          const a = heading + delivered[i].angle;
          const wheel = (d: number): [number, number] => [center[0] + d * Math.cos(a), center[1] + d * Math.sin(a)];
          const tip = (speed: number) => wheel(Math.max(0.09, speed * ARROW + 0.09));
          return (
            <g key={m.name}>
              {/* The wheel, drawn larger than life so its direction is easy to see. */}
              <line
                x1={sx(wheel(-0.08)[0])}
                y1={sy(wheel(-0.08)[1])}
                x2={sx(wheel(0.08)[0])}
                y2={sy(wheel(0.08)[1])}
                stroke={ROBOT_COLOR}
                strokeWidth={8}
                strokeLinecap="round"
              />
              {requested[i].speed - delivered[i].speed > 0.01 && (
                <ArrowLine
                  from={wheel(0.09)}
                  to={tip(requested[i].speed)}
                  color="var(--color-plot-muted)"
                  dashed
                  width={1.5}
                />
              )}
              {delivered[i].speed > 0.01 && (
                <ArrowLine
                  from={wheel(0.09)}
                  to={tip(delivered[i].speed)}
                  color={
                    over && desat === "off" && requested[i].speed > MAX_SPEED ? "var(--color-plot-2)" : MODULE_COLOR
                  }
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fd-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: MODULE_COLOR }}
          />
          Module velocity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: "var(--color-plot-muted)" }}
          />
          Requested before desaturation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: PATH_COLOR }}
          />
          Path over the next {GHOSTS[GHOSTS.length - 1]} s
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: ICR_COLOR }}
          />
          Center of rotation
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((m, i) => (
          <Readout
            key={m.name}
            label={`${MODULE_NAMES[m.name]} module`}
            value={`${fmt(delivered[i].speed, 3)} m/s, ${fmt((delivered[i].angle * 180) / Math.PI, 3)}°`}
          />
        ))}
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Module angles are in the robot frame, counterclockwise from the robot&apos;s front. Modules sit on a{" "}
        {MODULE_SPACING} m square. The fastest a module can go is {fmt(MAX_SPEED)} m/s (Kraken X60, FOC, at free speed
        through 6.75:1 and 4 in wheels).{" "}
        {over
          ? desat === "on"
            ? `Desaturation scales every module, and the whole robot, to ${fmt(scale * 100)}% of the request.`
            : "Orange arrows ask for more than the module can give. The real robot would curve off the path."
          : "No module is over its limit."}{" "}
        {icr && !icrVisible && "The center of rotation is off the view."} The model has no slip, no acceleration limits,
        and modules that steer instantly.
      </p>
    </Widget>
  );
};
