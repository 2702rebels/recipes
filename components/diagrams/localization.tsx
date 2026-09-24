import { Figure } from "./vision";

const MUTED = "var(--color-plot-muted)";
const ODOMETRY = "var(--color-plot-3)";
const GYRO = "var(--color-plot-2)";
/** Anything measured from the image, blue as on the Vision pages. */
const VISION = "var(--color-plot-4)";

const POSES = [90, 210, 330, 450, 570];
const ROW = 118;
const R = 22;

/** A factor: a small filled square joined by lines to the poses it connects. */
const Factor = ({ x, y, to, color }: { x: number; y: number; to: number[]; color: string }) => (
  <g>
    {to.map((px) => (
      <line
        key={px}
        x1={x}
        y1={y}
        x2={px}
        y2={ROW}
        stroke={color}
        strokeWidth={2}
      />
    ))}
    <rect
      x={x - 7}
      y={y - 7}
      width={14}
      height={14}
      fill={color}
    />
  </g>
);

/** A small factor graph for localization: robot poses joined by odometry, with gyro and tag-corner factors. */
export const FactorGraphDiagram = () => (
  <Figure
    caption={
      <>
        Circles are unknowns: the robot&apos;s pose at five moments. Squares are factors: measurements that tie poses
        together or to the field. The solver finds the poses that disagree least with all the factors at once.
      </>
    }>
    <svg
      viewBox="0 0 640 250"
      role="img"
      aria-label="Factor graph: five robot poses in a row, joined by odometry factors, with a prior on the first pose, gyro factors above, and tag-corner factors below two of the poses"
      className="mx-auto h-auto w-full max-w-2xl">
      {/* Odometry between each pair of poses. */}
      {POSES.slice(1).map((x, i) => (
        <Factor
          key={x}
          x={(x + POSES[i]) / 2}
          y={ROW}
          to={[POSES[i], x]}
          color={ODOMETRY}
        />
      ))}
      <Factor
        x={24}
        y={ROW}
        to={[POSES[0]]}
        color={MUTED}
      />
      {POSES.map((x) => (
        <Factor
          key={x}
          x={x}
          y={46}
          to={[x]}
          color={GYRO}
        />
      ))}
      {/* Tag corners seen from the second and fourth poses. */}
      {[POSES[1], POSES[3]].flatMap((x) =>
        [-36, -12, 12, 36].map((dx) => (
          <Factor
            key={`${x}${dx}`}
            x={x + dx}
            y={188}
            to={[x]}
            color={VISION}
          />
        ))
      )}
      {POSES.map((x, i) => (
        <g key={x}>
          <circle
            cx={x}
            cy={ROW}
            r={R}
            className="fill-fd-card"
            stroke="var(--color-fd-foreground)"
            strokeWidth={2}
          />
          <text
            x={x}
            y={ROW}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-fd-foreground text-[15px] italic">
            x<tspan className="text-[11px] not-italic">{i}</tspan>
          </text>
        </g>
      ))}
      {[
        { color: MUTED, label: "Prior (starting pose)" },
        { color: ODOMETRY, label: "Odometry" },
        { color: GYRO, label: "Gyro" },
        { color: VISION, label: "Tag corner (pixels)" },
      ].map((item, i) => (
        <g
          key={item.label}
          transform={`translate(${40 + i * 150} 234)`}>
          <rect
            x={0}
            y={-6}
            width={12}
            height={12}
            fill={item.color}
          />
          <text
            x={18}
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
