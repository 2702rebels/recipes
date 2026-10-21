import { Figure } from "./vision";

const INK = "var(--color-fd-foreground)";
const CARD = "var(--color-fd-card)";
const MUTED = "var(--color-plot-muted)";
const METAL = "var(--color-metal)";
/** Polycarbonate panels: a faint tint with a colored edge. */
const POLY = "var(--color-plot-4)";
const CALLOUT = "var(--color-plot-4)";
const FLOW = "var(--color-plot-3)";
const MOTION = "var(--color-plot-2)";
const BUMPER = "var(--color-bumper)";
const FUEL = "var(--color-fuel)";
const CORAL = "var(--color-coral)";

/** Pixels per inch. Both robots are drawn to the same scale. */
const S = 6.4;
/** Width of one panel (px). */
const PANEL = 460;
/** Screen x of the robot's center in each panel, and screen y of the carpet. */
const CX = 150;
const FLOOR = 412;
const HEIGHT = 472;
/** Extra room above z = FLOOR / S (px), so the top of the 2025 reef fits. */
const TOP = 74;

/** A point in inches: x toward the robot's front, z up from the carpet. */
type P = [number, number];

const r1 = (v: number) => Math.round(v * 10) / 10;
const X = (x: number) => r1(CX + x * S);
const Y = (z: number) => r1(FLOOR - z * S);
const pts = (p: P[]) => p.map(([x, z]) => `${X(x)},${Y(z)}`).join(" ");
const add = (a: P, b: P, k = 1): P => [a[0] + k * b[0], a[1] + k * b[1]];
const polar = (c: P, rad: number, deg: number): P => [
  c[0] + rad * Math.cos((deg * Math.PI) / 180),
  c[1] + rad * Math.sin((deg * Math.PI) / 180),
];

/** SVG arc command from the current point to angle `a1` on a circle about `c` (angles in degrees, counterclockwise). */
const arcTo = (c: P, rad: number, a0: number, a1: number) => {
  const [x, z] = polar(c, rad, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  // On screen, z points up, so a decreasing angle runs clockwise (sweep 1).
  return `A${r1(rad * S)},${r1(rad * S)} 0 ${large} ${a1 < a0 ? 1 : 0} ${X(x)},${Y(z)}`;
};

const arc = (c: P, rad: number, a0: number, a1: number) => {
  const [x, z] = polar(c, rad, a0);
  return `M${X(x)},${Y(z)} ${arcTo(c, rad, a0, a1)}`;
};

interface ShapeStyle {
  fill?: string;
  opacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

const style = ({ fill = METAL, opacity = 1, stroke = INK, strokeOpacity = 0.55, strokeWidth = 1 }: ShapeStyle) => ({
  fill,
  fillOpacity: opacity,
  stroke,
  strokeOpacity,
  strokeWidth,
  strokeLinejoin: "round" as const,
});

/** An axis-aligned box between two corners, in inches. */
const Box = ({ a, b, rx = 0, ...s }: { a: P; b: P; rx?: number } & ShapeStyle) => (
  <rect
    x={X(Math.min(a[0], b[0]))}
    y={Y(Math.max(a[1], b[1]))}
    width={r1(Math.abs(b[0] - a[0]) * S)}
    height={r1(Math.abs(b[1] - a[1]) * S)}
    rx={rx * S}
    {...style(s)}
  />
);

const Poly = ({ p, ...s }: { p: P[] } & ShapeStyle) => (
  <polygon
    points={pts(p)}
    {...style(s)}
  />
);

const Circle = ({ c, r, ...s }: { c: P; r: number } & ShapeStyle) => (
  <circle
    cx={X(c[0])}
    cy={Y(c[1])}
    r={r1(r * S)}
    {...style(s)}
  />
);

/** A rounded bar from `a` to `b`, `w` inches wide, with lightening holes. Used for plates, arms, and links. */
const Link = ({ a, b, w, holes = 0, ...s }: { a: P; b: P; w: number; holes?: number } & ShapeStyle) => {
  const [ax, ay, bx, by] = [X(a[0]), Y(a[1]), X(b[0]), Y(b[1])];
  const len = Math.hypot(bx - ax, by - ay);
  const h = (w * S) / 2;
  const nx = (-(by - ay) / len) * h;
  const ny = ((bx - ax) / len) * h;
  const d =
    `M${r1(ax + nx)},${r1(ay + ny)} L${r1(bx + nx)},${r1(by + ny)} ` +
    `A${r1(h)},${r1(h)} 0 0 0 ${r1(bx - nx)},${r1(by - ny)} L${r1(ax - nx)},${r1(ay - ny)} ` +
    `A${r1(h)},${r1(h)} 0 0 0 ${r1(ax + nx)},${r1(ay + ny)} Z`;
  return (
    <g>
      <path
        d={d}
        {...style(s)}
      />
      {Array.from({ length: holes }, (_, i) => {
        const t = (i + 1) / (holes + 1);
        return (
          <circle
            key={i}
            cx={r1(ax + t * (bx - ax))}
            cy={r1(ay + t * (by - ay))}
            r={r1(h * 0.45)}
            fill={CARD}
            stroke={INK}
            strokeOpacity={0.35}
          />
        );
      })}
    </g>
  );
};

/** A motor or gearbox seen end-on. */
const Motor = ({ c, r = 1.2 }: { c: P; r?: number }) => (
  <g>
    <Circle
      c={c}
      r={r}
      fill={MUTED}
      opacity={0.85}
      strokeOpacity={0.8}
    />
    <Circle
      c={c}
      r={r * 0.3}
      fill={METAL}
    />
  </g>
);

/** A roller seen end-on: a wheel with a shaft. */
const Roller = ({ c, r = 1.1 }: { c: P; r?: number }) => (
  <g>
    <Circle
      c={c}
      r={r}
      fill={MUTED}
      opacity={0.45}
      strokeOpacity={0.8}
    />
    <Circle
      c={c}
      r={0.3}
      fill={INK}
      opacity={0.7}
      strokeWidth={0}
    />
  </g>
);

/** A fuel ball (5.91 in across). */
const Fuel = ({ c }: { c: P }) => (
  <g>
    <Circle
      c={c}
      r={2.955}
      fill={FUEL}
      stroke={INK}
      strokeOpacity={0.35}
    />
    <Circle
      c={add(c, [-0.9, 0.9])}
      r={0.8}
      fill={CORAL}
      opacity={0.45}
      strokeWidth={0}
    />
  </g>
);

/** Rectangular frame tube with a row of holes, as on most FRC robots. */
const Tube = ({ a, b, opacity = 1 }: { a: P; b: P; opacity?: number }) => {
  const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
  const n = Math.floor(Math.abs(vertical ? b[1] - a[1] : b[0] - a[0])) - 1;
  const mid = vertical ? (a[0] + b[0]) / 2 : (a[1] + b[1]) / 2;
  const start = vertical ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]);
  return (
    <g>
      <Box
        a={a}
        b={b}
        opacity={opacity}
        strokeOpacity={0.7}
      />
      {Array.from({ length: Math.max(0, n) }, (_, i) => (
        <circle
          key={i}
          cx={X(vertical ? mid : start + 1 + i)}
          cy={Y(vertical ? start + 1 + i : mid)}
          r={0.9}
          fill={CARD}
          fillOpacity={0.9}
        />
      ))}
    </g>
  );
};

/** Left end and width of the carpet in each panel (px). */
const FLOOR_X0 = X(-21);
const FLOOR_W = 42 * S + 120;

/** Carpet, swerve wheels, and the side bumper with the team number. Shared by both robots. */
const Chassis = () => (
  <g>
    {/* Carpet: a shaded band with diagonal hatching under the surface line. */}
    <rect
      x={FLOOR_X0}
      y={FLOOR}
      width={FLOOR_W}
      height={10}
      fill={MUTED}
      fillOpacity={0.12}
    />
    <path
      d={Array.from(
        { length: Math.floor((FLOOR_W - 9) / 7) + 1 },
        (_, i) => `M${r1(FLOOR_X0 + 9 + i * 7)},${FLOOR} l-9,9`
      ).join(" ")}
      stroke={MUTED}
      strokeOpacity={0.55}
      strokeWidth={1}
    />
    <line
      x1={FLOOR_X0}
      x2={FLOOR_X0 + FLOOR_W}
      y1={FLOOR}
      y2={FLOOR}
      stroke={INK}
      strokeOpacity={0.7}
      strokeWidth={1.5}
    />
    {[-10.5, 10.5].map((x) => (
      <g key={x}>
        <Circle
          c={[x, 2]}
          r={2}
          fill={MUTED}
          opacity={0.9}
          strokeOpacity={0.8}
          strokeWidth={1.5}
        />
        <Circle
          c={[x, 2]}
          r={1.1}
          fill={METAL}
        />
      </g>
    ))}
  </g>
);

/** The side bumper. Drawn after the frame so it hides what is behind it, as it does from the side. */
const Bumper = () => (
  <g>
    <Box
      a={[-16.75, 2.25]}
      b={[16.75, 7.25]}
      rx={1.1}
      fill={BUMPER}
      strokeOpacity={0.6}
    />
    <line
      x1={X(-16)}
      x2={X(16)}
      y1={Y(6.5)}
      y2={Y(6.5)}
      stroke={CORAL}
      strokeOpacity={0.3}
      strokeDasharray="3 3"
    />
    <text
      x={X(0)}
      y={Y(4.6)}
      textAnchor="middle"
      dominantBaseline="central"
      fill={CORAL}
      className="text-base font-bold tracking-widest">
      2702
    </text>
  </g>
);

/** A numbered balloon at `at` with a leader line to the part at `to`, both in inches. */
const Balloon = ({ n, at, to }: { n: number; at: P; to: P }) => {
  const [bx, by, tx, ty] = [X(at[0]), Y(at[1]), X(to[0]), Y(to[1])];
  const len = Math.hypot(tx - bx, ty - by);
  return (
    <g>
      <line
        x1={r1(bx + ((tx - bx) / len) * 9)}
        y1={r1(by + ((ty - by) / len) * 9)}
        x2={tx}
        y2={ty}
        stroke={CALLOUT}
        strokeWidth={1.25}
      />
      <circle
        cx={tx}
        cy={ty}
        r={2.2}
        fill={CALLOUT}
      />
      <circle
        cx={bx}
        cy={by}
        r={9}
        fill={CALLOUT}
        stroke={CARD}
        strokeWidth={2}
      />
      <text
        x={bx}
        y={by}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-fd-card text-[11px] font-bold">
        {n}
      </text>
    </g>
  );
};

/** Arrowhead marker for the diagram's paths. */
const Arrowhead = ({ id, color }: { id: string; color: string }) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX="7"
    refY="5"
    markerWidth="5"
    markerHeight="5"
    orient="auto-start-reverse">
    <path
      d="M0,0 L10,5 L0,10 z"
      fill={color}
    />
  </marker>
);

/** A dashed path drawn over a halo in the card color, so it stays readable where it crosses parts. */
const FlowPath = ({ d, color, marker, both }: { d: string; color: string; marker: string; both?: boolean }) => (
  <g fill="none">
    <path
      d={d}
      stroke={CARD}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.85}
    />
    <path
      d={d}
      stroke={color}
      strokeWidth={2.25}
      strokeDasharray="6 4"
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={`url(#${marker})`}
      markerStart={both ? `url(#${marker})` : undefined}
    />
  </g>
);

const Title = ({ title, sub }: { title: string; sub: string }) => (
  <g>
    <text
      x={PANEL / 2}
      y={FLOOR + 32}
      textAnchor="middle"
      className="fill-fd-foreground text-sm font-semibold">
      {title}
    </text>
    <text
      x={PANEL / 2}
      y={FLOOR + 48}
      textAnchor="middle"
      className="fill-fd-muted-foreground text-xs">
      {sub}
    </text>
  </g>
);

/** Shooter flywheel center, and the hood radius around it (in). The flywheel sits on the turret, ahead of the hood. */
const FLYWHEEL: P = [-7.7, 24.6];
const HOOD = 7;
/** Distance from the flywheel center to a ball's center while the ball is in the shooter. */
const BALL_PATH = 2 + 2.955;
/** Center line of the indexer, which feeds up through the turret. */
const INDEXER_X = -10.2;
/** Turret center and the height of its bearing ring. */
const TURRET: P = [-9.5, 20.2];

/** The front half of a horizontal circle seen from the side, drawn as a flat arc: shows a spin about a vertical axis. */
const spin = (c: P, rx: number, ry: number) =>
  `M${X(c[0] - rx)},${Y(c[1])} A${r1(rx * S)},${r1(ry * S)} 0 0 0 ${X(c[0] + rx)},${Y(c[1])}`;

/** A 2026-style shooting robot: slide intake, hopper with a spindexer, roller indexer, and a shooter on a turret. */
const ShootingRobot = () => {
  const roller: P = [22.8, 6];
  const hopperBalls: P[] = [
    [-2, 11.25],
    [3.95, 11.25],
    [9.5, 11.25],
    [0.97, 16.35],
    [6.92, 16.35],
    [-2, 21.45],
    [3.95, 21.45],
    [9.5, 21.45],
  ];
  const entry = polar(FLYWHEEL, BALL_PATH, 240);
  const exit = polar(FLYWHEEL, BALL_PATH, 150);
  const flow =
    `M${X(25.6)},${Y(2.955)} Q${X(21.5)},${Y(10)} ${X(16)},${Y(9.8)} ` +
    `L${X(-3)},${Y(9.6)} Q${X(INDEXER_X)},${Y(9.6)} ${X(INDEXER_X)},${Y(13.5)} ` +
    `L${X(entry[0])},${Y(entry[1])} ${arcTo(FLYWHEEL, BALL_PATH, 240, 150)} ` +
    `Q${X(exit[0] + 5)},${Y(exit[1] + 8.7)} ${X(8)},${Y(40.5)}`;

  return (
    <g>
      <Chassis />

      {/* Hopper: polycarbonate wall, frame posts, the spindexer's spinning floor and center post, and fuel. */}
      <Box
        a={[-5, 7.25]}
        b={[12.5, 25.5]}
        fill={POLY}
        opacity={0.1}
        stroke={POLY}
        strokeOpacity={0.6}
      />
      <Tube
        a={[-5.5, 12]}
        b={[-4.5, 26]}
      />
      <Tube
        a={[12, 14]}
        b={[13, 26]}
      />
      <Tube
        a={[-5.5, 25]}
        b={[13, 26]}
      />
      <Box
        a={[-4.8, 7.6]}
        b={[12.3, 8.3]}
        rx={0.3}
        opacity={0.9}
      />
      {hopperBalls.map((c) => (
        <Fuel
          key={c.join()}
          c={c}
        />
      ))}
      <Box
        a={[3.55, 8.3]}
        b={[4.35, 15.6]}
        opacity={0.9}
      />

      {/* Indexer: pairs of rollers that lift one ball at a time. */}
      {[9, 13, 17].flatMap((z) =>
        [INDEXER_X - 3.8, INDEXER_X + 3.8].map((x) => (
          <Roller
            key={`${x},${z}`}
            c={[x, z]}
            r={0.85}
          />
        ))
      )}
      {[10.6, 16.5].map((z) => (
        <Fuel
          key={z}
          c={[INDEXER_X, z]}
        />
      ))}

      {/* Turret: bearing ring with a gear rim. */}
      <Box
        a={[-15, TURRET[1] - 0.6]}
        b={[-4, TURRET[1] + 0.6]}
        rx={0.3}
        opacity={0.9}
        strokeOpacity={0.7}
      />
      <line
        x1={X(-14.6)}
        x2={X(-4.4)}
        y1={Y(TURRET[1] - 0.6)}
        y2={Y(TURRET[1] - 0.6)}
        stroke={INK}
        strokeOpacity={0.5}
        strokeWidth={2}
        strokeDasharray="1.5 1.5"
      />

      {/* Shooter on the turret: side plate, hood, a ball on its way through, and the flywheel. */}
      <Box
        a={[-15.5, TURRET[1] + 0.6]}
        b={[-4, 30]}
        rx={1.2}
        opacity={0.25}
      />
      <Fuel c={polar(FLYWHEEL, BALL_PATH, 190)} />
      <path
        d={arc(FLYWHEEL, HOOD, 225, 145)}
        fill="none"
        stroke={POLY}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Circle
        c={FLYWHEEL}
        r={2}
        fill={MUTED}
        opacity={0.6}
        strokeOpacity={0.8}
      />
      {[0, 60, 120].map((a) => {
        const [p, q] = [polar(FLYWHEEL, 1.8, a), polar(FLYWHEEL, 1.8, a + 180)];
        return (
          <line
            key={a}
            x1={X(p[0])}
            y1={Y(p[1])}
            x2={X(q[0])}
            y2={Y(q[1])}
            stroke={INK}
            strokeOpacity={0.5}
          />
        );
      })}
      <Circle
        c={FLYWHEEL}
        r={0.5}
        fill={METAL}
      />

      {/* Intake: a fixed tube, the tube that slides out of it, an end plate, one roller, and a ball on the carpet. */}
      <Tube
        a={[5, 9.4]}
        b={[14, 10.6]}
      />
      <Box
        a={[9, 9.65]}
        b={[22.4, 10.35]}
        opacity={0.95}
        strokeOpacity={0.7}
      />
      <Link
        a={[22.4, 10.6]}
        b={roller}
        w={2.4}
        opacity={0.55}
      />
      <Roller
        c={roller}
        r={1.25}
      />
      <Motor
        c={[22.4, 10.6]}
        r={1}
      />
      <Fuel c={[25.6, 2.955]} />

      <Bumper />

      {/* The 2026 height limit applies for the whole match. */}
      <line
        x1={X(-17)}
        x2={X(30)}
        y1={Y(30)}
        y2={Y(30)}
        stroke={MUTED}
        strokeDasharray="2 4"
      />
      <text
        x={X(30)}
        y={Y(30) - 5}
        textAnchor="end"
        className="fill-fd-muted-foreground text-[11px]">
        30 in height limit
      </text>

      <FlowPath
        d={flow}
        color={FLOW}
        marker="rl-flow"
      />
      <text
        x={X(8.5)}
        y={Y(40.5) - 8}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        To the hub
      </text>
      <FlowPath
        d={`M${X(15)},${Y(12.6)} L${X(21)},${Y(12.6)}`}
        color={MOTION}
        marker="rl-motion"
        both
      />
      <FlowPath
        d={spin(TURRET, 6.8, 1.2)}
        color={MOTION}
        marker="rl-motion"
        both
      />
      <FlowPath
        d={spin([3.95, 15], 2.8, 0.8)}
        color={MOTION}
        marker="rl-motion"
        both
      />

      <Balloon
        n={1}
        at={[27.5, 15]}
        to={[20, 10]}
      />
      <Balloon
        n={2}
        at={[18.5, 26]}
        to={[13, 22]}
      />
      <Balloon
        n={3}
        at={[18.5, 19]}
        to={[12.2, 8]}
      />
      <Balloon
        n={4}
        at={[-20.5, 12]}
        to={[-14.8, 12]}
      />
      <Balloon
        n={5}
        at={[-20.5, 20.2]}
        to={[-15, 20.2]}
      />
      <Balloon
        n={6}
        at={[-19.5, 30.5]}
        to={[-15.5, 27]}
      />
      <Title
        title="Shooting robot"
        sub="2026 style, under the 30 in height limit"
      />
    </g>
  );
};

/** Arm length, pivot to where it meets the end effector (in). */
const ARM = 15.9;
/** Angle of the end effector's axis relative to the arm (°). The end effector is built into the arm. */
const EFFECTOR = -80;

/** Unit vector at `deg` degrees, counterclockwise from +x. */
const dir = (deg: number): P => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

/**
 * The arm and its built-in end effector, at arm angle `angle` about `pivot`. The end effector is a box of rollers along
 * its own axis. The arm meets it on its upper side, 3 in from the back. With `coral`, it holds a coral along its axis.
 */
const ArmAssembly = ({ pivot, angle, coral }: { pivot: P; angle: number; coral?: boolean }) => {
  const u = dir(angle + EFFECTOR);
  const n: P = [-u[1], u[0]];
  const end = add(pivot, dir(angle), ARM);
  const back = add(add(end, u, -3), n, -3.1);
  const at = (s: number, k: number) => add(add(back, u, s), n, k);
  const center = at(6.5, 0);
  return (
    <g>
      <Link
        a={pivot}
        b={end}
        w={1.9}
        holes={3}
        opacity={0.85}
      />
      <Poly
        p={[at(0, 3.1), at(7.5, 3.1), at(7.5, -3.1), at(0, -3.1)]}
        opacity={0.4}
        strokeOpacity={0.7}
      />
      {coral && (
        <Poly
          p={[
            add(add(center, u, -5.94), n, 2),
            add(add(center, u, 5.94), n, 2),
            add(add(center, u, 5.94), n, -2),
            add(add(center, u, -5.94), n, -2),
          ]}
          fill={CORAL}
          strokeOpacity={0.6}
        />
      )}
      {[2, 6].flatMap((s) =>
        [2.9, -2.9].map((k) => (
          <Roller
            key={`${s},${k}`}
            c={at(s, k)}
            r={0.9}
          />
        ))
      )}
      <Motor
        c={pivot}
        r={1.3}
      />
    </g>
  );
};

/** The elevator carriage, with the arm pivot at `pivot`. */
const Carriage = ({ pivot }: { pivot: P }) => (
  <g>
    <Box
      a={[6.4, pivot[1] - 4]}
      b={[10, pivot[1] + 4]}
      rx={0.5}
      opacity={0.7}
      strokeOpacity={0.7}
    />
    {[-3.2, 3.2].map((dz) => (
      <Circle
        key={dz}
        c={[7, pivot[1] + dz]}
        r={0.45}
        fill={INK}
        opacity={0.5}
        strokeWidth={0}
      />
    ))}
  </g>
);

/** Direction the coral and the L3 branch point along: 35° below horizontal, toward the reef. */
const U = dir(-35);

/** Arm pivot and angle while scoring on L3, and while picking coral off the carpet. */
const SCORE = { pivot: [7.95, 44.95] as P, angle: 45 };
const PICKUP = { pivot: [7.95, 10.8] as P, angle: -10 };

/**
 * One reef pipe in side view (in). The trunk rises from the carpet, the L2 and L3 branches reach 9.6 in toward the
 * robot, and above BEND the pipe angles 10.1 in toward the robot and ends in the vertical L4 post at 72 in.
 */
const TRUNK = 35.6;
const BEND = 56;
const L4_X = TRUNK - 10.1;

/** A 2025-style pick-and-place robot: an elevator near the front, an arm with a built-in end effector, and a climber. */
const PickPlaceRobot = () => {
  const branchEnd: P = [26, 47.625];
  const branch = (end: P) => add(end, U, (TRUNK - end[0]) / U[0]);
  // Trunk, the 35° jog toward the robot, and the L4 post, with rounded bends.
  const jogTop: P = [L4_X, BEND + 10.1 * Math.tan((35 * Math.PI) / 180)];
  const ease = (from: P, to: P, k: number): P => add(from, add(to, from, -1), k);
  const corner = (prev: P, at: P, next: P) => {
    const [a, b] = [
      ease(at, prev, 2.4 / Math.hypot(prev[0] - at[0], prev[1] - at[1])),
      ease(at, next, 2.4 / Math.hypot(next[0] - at[0], next[1] - at[1])),
    ];
    return `L${X(a[0])},${Y(a[1])} Q${X(at[0])},${Y(at[1])} ${X(b[0])},${Y(b[1])}`;
  };
  // Round caps add 0.83 in at each end, so the trunk starts and ends that much short of the carpet and 72 in.
  const trunk =
    `M${X(TRUNK)},${Y(0.83)} ` +
    corner([TRUNK, 0], [TRUNK, BEND], jogTop) +
    " " +
    corner([TRUNK, BEND], jogTop, [L4_X, 72]) +
    ` L${X(L4_X)},${Y(72 - 0.83)}`;
  const branches = [[26, 31.875] as P, branchEnd]
    .map((end) => {
      const root = branch(end);
      return `M${X(root[0])},${Y(root[1])} L${X(end[0])},${Y(end[1])}`;
    })
    .join(" ");
  // The climber's hook is a V-shaped plate that lies flat, parallel to the carpet. From the side it is seen edge-on.
  const hookPin: P = [-16.2, 20.4];

  return (
    <g>
      {/* The reef, faded: one pipe with the L2 and L3 branches, which tilt up 35°, and the L4 post on top. It is a
          single path, so the stroke paints once and the joints don't darken (the muted color is translucent). */}
      <path
        d={`${trunk} ${branches}`}
        fill="none"
        stroke={MUTED}
        strokeOpacity={0.4}
        strokeWidth={1.66 * S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        { label: "L2", at: [25.6, 29.4] as P },
        { label: "L3", at: [25.6, 45.1] as P },
        { label: "L4", at: [L4_X - 1.6, 69] as P },
        { label: "Reef", at: [TRUNK + 1.6, 30] as P },
      ].map((t) => (
        <text
          key={t.label}
          x={X(t.at[0])}
          y={Y(t.at[1])}
          textAnchor={t.label === "Reef" ? "start" : "end"}
          dominantBaseline="central"
          className="fill-fd-muted-foreground text-[11px]">
          {t.label}
        </text>
      ))}

      <Chassis />

      {/* Climber: a gearbox on the frame, and a pivoting arm ending in a flat hook plate, seen edge-on. */}
      <Box
        a={[-11.6, 7.25]}
        b={[-6.4, 12.8]}
        rx={0.4}
        opacity={0.35}
      />
      <Link
        a={[-9, 10.5]}
        b={hookPin}
        w={1.8}
        opacity={0.8}
      />
      <Box
        a={[-21.6, 20]}
        b={[-14.8, 21.2]}
        rx={0.3}
      />
      <Circle
        c={hookPin}
        r={0.35}
        fill={INK}
        strokeWidth={0}
      />
      <Motor c={[-9, 10.5]} />

      {/* Elevator near the front: gearbox, fixed stage, and moving stage. */}
      <Box
        a={[-1.8, 7.25]}
        b={[2.4, 14.2]}
        rx={0.4}
        opacity={0.35}
      />
      <Motor c={[0.3, 9.4]} />
      <Motor c={[0.3, 12.1]} />
      <Tube
        a={[2.4, 7.25]}
        b={[4.4, 40]}
      />
      <Tube
        a={[4.4, 20]}
        b={[6.4, 49]}
      />
      <Circle
        c={[3.4, 39.1]}
        r={0.8}
        fill={MUTED}
      />

      {/* The same carriage, arm, and end effector, faded, lowered to pick a coral off the carpet. */}
      <g opacity={0.35}>
        <Carriage pivot={PICKUP.pivot} />
        <ArmAssembly {...PICKUP} />
      </g>

      {/* Carriage, arm, and end effector placing a coral on L3. */}
      <Carriage pivot={SCORE.pivot} />
      <ArmAssembly
        {...SCORE}
        coral
      />

      <Bumper />

      <FlowPath
        d={`M${X(0.6)},${Y(24)} L${X(0.6)},${Y(37)}`}
        color={MOTION}
        marker="rl-motion"
        both
      />
      <FlowPath
        d={arc(SCORE.pivot, 5.8, 80, 12)}
        color={MOTION}
        marker="rl-motion"
        both
      />

      <Balloon
        n={1}
        at={[-6, 33]}
        to={[2.4, 30]}
      />
      <Balloon
        n={2}
        at={[6.5, 60.5]}
        to={[13.6, 50.6]}
      />
      <Balloon
        n={3}
        at={[25.5, 59.5]}
        to={[18, 53.3]}
      />
      <Balloon
        n={4}
        at={[28.5, 9]}
        to={[23.6, 7]}
      />
      <Balloon
        n={5}
        at={[-21, 28.5]}
        to={[-19.5, 21.2]}
      />
      <Title
        title="Pick-and-place robot"
        sub="2025 style, placing a coral on L3"
      />
    </g>
  );
};

const LEGENDS: { title: string; items: string[] }[] = [
  {
    title: "Shooting robot",
    items: [
      "Intake: a roller on a slide that deploys past the bumper",
      "Hopper: stores fuel",
      "Spindexer: a spinning floor that feeds fuel to the indexer",
      "Indexer: rollers that lift one ball at a time up through the turret",
      "Turret: turns the shooter to aim",
      "Shooter: a flywheel throws the ball along the hood",
    ],
  },
  {
    title: "Pick-and-place robot",
    items: [
      "Elevator: a fixed stage, a moving stage, and the carriage",
      "Arm: pivots on the elevator carriage",
      "End effector: rollers built into the arm, holding a coral",
      "Floor pickup (faded): the same arm and end effector, lowered to pick coral off the carpet",
      "Climber: a hook that latches onto the cage",
    ],
  },
];

/** Side views of a typical shooting robot and a typical pick-and-place robot, drawn to scale, with numbered parts. */
export const RobotLayouts = () => (
  <Figure
    caption={
      <>
        Side views drawn to the same scale, front on the right, with game pieces at their real size. The green dashed
        line is the path a ball takes, from the carpet to the hub. The orange arrows show how mechanisms move. The faded
        arm shows the pick-and-place robot&apos;s floor pickup pose.
      </>
    }>
    <svg
      viewBox={`0 ${-TOP} ${PANEL * 2} ${HEIGHT + TOP}`}
      role="img"
      aria-label="Side views of a shooting robot with an intake, hopper, indexer, and shooter, and of a pick-and-place robot with an elevator, an arm with a built-in end effector that also picks coral off the carpet, and a climber, placing a coral on the reef"
      className="mx-auto h-auto w-full max-w-4xl">
      <defs>
        <Arrowhead
          id="rl-flow"
          color={FLOW}
        />
        <Arrowhead
          id="rl-motion"
          color={MOTION}
        />
      </defs>
      <ShootingRobot />
      <g transform={`translate(${PANEL} 0)`}>
        <PickPlaceRobot />
      </g>
    </svg>
    <div className="mx-auto mt-3 mb-5 grid max-w-3xl gap-x-8 gap-y-3 text-left text-xs sm:grid-cols-2">
      {LEGENDS.map((l) => (
        <div key={l.title}>
          <div className="mb-1 font-semibold text-fd-foreground">{l.title}</div>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {l.items.map((item, i) => (
              <li
                key={item}
                className="m-0 flex items-center gap-2">
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-fd-card"
                  style={{ background: CALLOUT }}>
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  </Figure>
);
