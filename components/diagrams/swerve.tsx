import { Figure } from "./vision";

const INK = "var(--color-fd-foreground)";
const MUTED = "var(--color-plot-muted)";
const PUSH = "var(--color-plot-3)";
const SUM = "var(--color-plot-2)";

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

/** A straight arrow from `(x1, y1)` to `(x2, y2)`, using the marker with `id`. */
const Arrow = ({
  x1,
  y1,
  x2,
  y2,
  color,
  marker,
  width = 3,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  marker: string;
  width?: number;
}) => (
  <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    markerEnd={`url(#${marker})`}
  />
);

/** A wheel seen from above, centered at `(x, y)` and turned `angle` degrees clockwise from the robot's front. */
const Wheel = ({
  x,
  y,
  angle = 0,
  hatch,
}: {
  x: number;
  y: number;
  angle?: number;
  /** Draw diagonal rollers, for a mecanum wheel. 1 or -1 sets the slant. */
  hatch?: 1 | -1;
}) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect
      x={-8}
      y={-17}
      width={16}
      height={34}
      rx={3}
      fill={MUTED}
      fillOpacity={0.35}
      stroke={INK}
      strokeWidth={1.5}
    />
    {hatch &&
      [-12, -4, 4, 12].map((dy) => (
        <line
          key={dy}
          x1={-7}
          y1={dy + 5 * hatch}
          x2={7}
          y2={dy - 5 * hatch}
          stroke={INK}
          strokeWidth={1}
        />
      ))}
  </g>
);

/** The robot's frame seen from above, with its front edge marked. */
const Body = ({ cx, cy }: { cx: number; cy: number }) => (
  <g>
    <rect
      x={cx - 60}
      y={cy - 60}
      width={120}
      height={120}
      rx={8}
      fill="none"
      stroke={INK}
      strokeWidth={2}
    />
    <line
      x1={cx - 36}
      y1={cy - 60}
      x2={cx + 36}
      y2={cy - 60}
      stroke={INK}
      strokeWidth={6}
      strokeLinecap="round"
    />
  </g>
);

const PANEL = 220;
const CY = 112;

/** Tank, mecanum, and swerve drivetrains from above, with the forces each wheel can push with. */
export const DrivetrainComparison = () => {
  const centers = [PANEL / 2, PANEL * 1.5, PANEL * 2.5];
  const [tank, mecanum, swerve] = centers;
  // Mecanum strafing right: front-left and back-right push forward and right, the other two back and right.
  const mecanumWheels: { dx: number; dy: number; up: boolean }[] = [
    { dx: -48, dy: -38, up: true },
    { dx: 48, dy: -38, up: false },
    { dx: -48, dy: 38, up: false },
    { dx: 48, dy: 38, up: true },
  ];
  return (
    <Figure
      caption={
        <>
          The thick bar is the front of each robot. Tank wheels only push forward or back, so the robot turns to change
          direction. Mecanum wheels push at 45° through free-spinning rollers. To strafe right, the forward and backward
          parts of the four pushes cancel, and only the sideways parts are left. Swerve modules turn the whole wheel, so
          every wheel pushes fully in the direction of travel.
        </>
      }>
      <svg
        viewBox={`0 0 ${PANEL * 3} 270`}
        role="img"
        aria-label="Top-down views of a tank, a mecanum, and a swerve drivetrain, with arrows for the push of each wheel"
        className="mx-auto h-auto w-full max-w-3xl">
        <defs>
          <Arrowhead
            id="dt-push"
            color={PUSH}
          />
          <Arrowhead
            id="dt-sum"
            color={SUM}
          />
        </defs>

        {/* Tank: three wheels a side, all pointing forward. */}
        <Body
          cx={tank}
          cy={CY}
        />
        {[-1, 1].flatMap((side) =>
          [-38, 0, 38].map((dy) => (
            <g key={`${side}${dy}`}>
              <Wheel
                x={tank + side * 48}
                y={CY + dy}
              />
              <Arrow
                x1={tank + side * 48 + side * 18}
                y1={CY + dy + 10}
                x2={tank + side * 48 + side * 18}
                y2={CY + dy - 12}
                color={PUSH}
                marker="dt-push"
                width={2.5}
              />
            </g>
          ))
        )}
        <Arrow
          x1={tank}
          y1={CY + 20}
          x2={tank}
          y2={CY - 30}
          color={SUM}
          marker="dt-sum"
        />

        {/* Mecanum: four wheels with rollers at 45°. */}
        <Body
          cx={mecanum}
          cy={CY}
        />
        {mecanumWheels.map(({ dx, dy, up }) => {
          const x = mecanum + dx;
          const y = CY + dy;
          return (
            <g key={`${dx}${dy}`}>
              <Wheel
                x={x}
                y={y}
                hatch={up ? 1 : -1}
              />
              <Arrow
                x1={x}
                y1={y}
                x2={x + 24}
                y2={y + (up ? -24 : 24)}
                color={PUSH}
                marker="dt-push"
                width={2.5}
              />
            </g>
          );
        })}
        <Arrow
          x1={mecanum - 22}
          y1={CY}
          x2={mecanum + 24}
          y2={CY}
          color={SUM}
          marker="dt-sum"
        />

        {/* Swerve: four modules, each turned toward the direction of travel. */}
        <Body
          cx={swerve}
          cy={CY}
        />
        {[
          [-40, -40],
          [40, -40],
          [-40, 40],
          [40, 40],
        ].map(([dx, dy]) => {
          const x = swerve + dx;
          const y = CY + dy;
          return (
            <g key={`${dx}${dy}`}>
              <circle
                cx={x}
                cy={y}
                r={19}
                fill="none"
                stroke={MUTED}
                strokeWidth={1.5}
              />
              <Wheel
                x={x}
                y={y}
                angle={45}
              />
              <Arrow
                x1={x}
                y1={y}
                x2={x + 26}
                y2={y - 26}
                color={PUSH}
                marker="dt-push"
                width={2.5}
              />
            </g>
          );
        })}
        <Arrow
          x1={swerve - 18}
          y1={CY + 15}
          x2={swerve + 20}
          y2={CY - 17}
          color={SUM}
          marker="dt-sum"
        />

        {[
          { x: tank, title: "Tank", sub: "Forward, back, and turn" },
          { x: mecanum, title: "Mecanum", sub: "Any direction, through rollers" },
          { x: swerve, title: "Swerve", sub: "Any direction, full traction" },
        ].map((p) => (
          <g key={p.title}>
            <text
              x={p.x}
              y={214}
              textAnchor="middle"
              className="fill-fd-foreground text-sm font-semibold">
              {p.title}
            </text>
            <text
              x={p.x}
              y={234}
              textAnchor="middle"
              className="fill-fd-muted-foreground text-xs">
              {p.sub}
            </text>
          </g>
        ))}
        {[
          { color: PUSH, label: "Push from one wheel" },
          { color: SUM, label: "Motion of the robot" },
        ].map((item, i) => (
          <g
            key={item.label}
            transform={`translate(${PANEL * 1.5 - 170 + i * 190} 258)`}>
            <line
              x1={0}
              x2={20}
              y1={0}
              y2={0}
              stroke={item.color}
              strokeWidth={3}
            />
            <text
              x={28}
              y={0}
              dominantBaseline="central"
              className="fill-fd-muted-foreground text-xs">
              {item.label}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
};
