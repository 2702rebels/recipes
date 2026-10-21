import { Figure } from "./vision";

const INK = "var(--color-fd-foreground)";
const MUTED = "var(--color-plot-muted)";
const CALLOUT = "var(--color-plot-4)";
const GYRO = "var(--color-plot-2)";
/** Bare aluminum, for frame tube. */
const FRAME = "var(--color-metal)";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SDS_MK3 = "https://www.swervedrivespecialties.com/products/mk3-swerve-module";

/** SDS's MK3 layout drawing (bottom and side views), with the dimensions removed, 1600 × 944 px. Black on transparent. */
const LAYOUT = { src: `${BASE}/images/swerve/sds-mk3-layout.png`, width: 1600, height: 944 };

/**
 * The MK3's plate alone, from below, cropped from the same drawing. The image is 5.62 in square, and the plate's outer
 * corner sits 0.06 in in from the image's top-left corner. The steering axis is 3.00 in from both outer edges.
 */
const PLATE = { src: `${BASE}/images/swerve/sds-mk3-plate.png`, size: 5.62, offset: 0.06, edge: 5.5, axis: 3 };

/** Numbered callouts on the layout drawing, in its pixel coordinates. A part can appear in both views. */
const CALLOUTS: { n: number; label: string; at: [number, number][] }[] = [
  {
    n: 1,
    label: "Wheel and tread",
    at: [
      [320, 373],
      [1281, 886],
    ],
  },
  {
    n: 2,
    label: "Bevel gear on the wheel",
    at: [
      [422, 467],
      [1388, 614],
    ],
  },
  { n: 3, label: "Fork, which turns with the wheel", at: [[1172, 634]] },
  { n: 4, label: "Steering axis", at: [[354, 516]] },
  { n: 5, label: "Module plate, bolted to the frame", at: [[1009, 503]] },
  { n: 6, label: "Gear stages for steering and drive", at: [[1291, 341]] },
  { n: 7, label: "Drive motor", at: [[1187, 132]] },
  { n: 8, label: "Steer (azimuth) motor", at: [[1438, 132]] },
];

/** A numbered balloon, the way engineering drawings call out parts. */
const Balloon = ({ x, y, n, r = 28 }: { x: number; y: number; n: number; r?: number }) => (
  <g>
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={CALLOUT}
      className="stroke-fd-card"
      strokeWidth={4}
    />
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      className="fill-fd-card"
      style={{ fontSize: r * 1.15, fontWeight: 700 }}>
      {n}
    </text>
  </g>
);

/** SDS's layout drawing of the MK3 module, with numbered callouts for the main parts. */
export const MK3Drawing = () => (
  <Figure
    caption={
      <>
        Layout drawing of the{" "}
        <a
          href={SDS_MK3}
          className="underline">
          SDS MK3
        </a>{" "}
        module, © Swerve Drive Specialties. Left: from below. Right: from the side.
      </>
    }>
    <svg
      viewBox={`0 0 ${LAYOUT.width} ${LAYOUT.height}`}
      role="img"
      aria-label="SDS MK3 swerve module layout drawing from below and from the side, with numbered callouts"
      className="mx-auto h-auto w-full">
      <image
        href={LAYOUT.src}
        width={LAYOUT.width}
        height={LAYOUT.height}
        className="dark:invert"
      />
      {CALLOUTS.flatMap((c) =>
        c.at.map(([x, y]) => (
          <Balloon
            key={`${c.n}-${x}`}
            x={x}
            y={y}
            n={c.n}
          />
        ))
      )}
    </svg>
    <ol className="mx-auto mt-3 grid max-w-xl list-none gap-x-6 gap-y-1 p-0 text-left text-xs sm:grid-cols-2">
      {CALLOUTS.map((c) => (
        <li
          key={c.n}
          className="m-0 flex items-center gap-2">
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-fd-card"
            style={{ background: CALLOUT }}>
            {c.n}
          </span>
          {c.label}
        </li>
      ))}
    </ol>
  </Figure>
);

/** Formats meters to two decimals, with a true minus sign. */
const fmtM = (m: number) => m.toFixed(2).replace("-", "−");

/** Half the frame width in the layout example (in): a 29 in square frame. */
const HALF_FRAME = 14.5;
const IN_TO_M = 0.0254;

/**
 * Top view of a square drivetrain: an MK3 in each corner, drawn from SDS's drawing, and the gyro at the center. The
 * module's outer edges are flush with the frame's outer edges.
 */
export const DrivetrainLayout = () => {
  const s = 10.5;
  const cx = 260;
  const cy = 200;
  // Robot frame (in) to screen: x forward to the right, y left (up the screen).
  const toScreen = (x: number, y: number): [number, number] => [cx + x * s, cy - y * s];
  const axisIn = HALF_FRAME - PLATE.axis;
  const axisM = axisIn * IN_TO_M;
  const bumper = 3;
  const [fx0, fy0] = toScreen(-HALF_FRAME, HALF_FRAME);
  const frameSize = 2 * HALF_FRAME * s;
  // Front-left corner, where the drawing (seen from below, so mirrored) puts the plate's outer corner.
  const [flx, fly] = toScreen(HALF_FRAME, HALF_FRAME);
  const corners = [
    { name: "FL", sx: 1, sy: 1, turn: 0 },
    { name: "FR", sx: 1, sy: -1, turn: 90 },
    { name: "BR", sx: -1, sy: -1, turn: 180 },
    { name: "BL", sx: -1, sy: 1, turn: 270 },
  ];

  return (
    <Figure
      caption={
        <>
          A 29 in square drivetrain from above, with the front to the right and an SDS MK3 in each corner. With the
          modules flush with the frame&apos;s outer edges, each steering axis is 3.00 in in from both edges, or about
          0.29 m from the robot&apos;s center in <em>x</em> and <em>y</em>. These are the module positions the
          kinematics uses. The MK3 fits every corner, turned. The gyro sits flat near the center, with its <em>x</em>{" "}
          axis pointing forward.
        </>
      }>
      <svg
        viewBox="0 0 640 400"
        role="img"
        aria-label="Top view of a swerve robot: square frame, an SDS MK3 module in each corner, steering axes 0.29 m from the center, and a gyro at the center"
        className="mx-auto h-auto w-full max-w-2xl">
        <defs>
          <marker
            id="layout-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse">
            <path
              d="M0,0 L10,5 L0,10 z"
              fill={INK}
            />
          </marker>
        </defs>

        {/* Bumpers, frame tube, and the front marker. */}
        <rect
          x={fx0 - bumper * s}
          y={fy0 - bumper * s}
          width={frameSize + 2 * bumper * s}
          height={frameSize + 2 * bumper * s}
          rx={10}
          fill="none"
          stroke={MUTED}
          strokeDasharray="6 5"
        />
        <path
          d={`M${fx0},${fy0}h${frameSize}v${frameSize}h${-frameSize}Z M${fx0 + s},${fy0 + s}v${frameSize - 2 * s}h${frameSize - 2 * s}v${-(frameSize - 2 * s)}Z`}
          fill={FRAME}
          fillOpacity={0.55}
          fillRule="evenodd"
          stroke={FRAME}
        />
        <line
          x1={fx0 + frameSize + bumper * s}
          x2={fx0 + frameSize + bumper * s}
          y1={cy - 70}
          y2={cy + 70}
          stroke={INK}
          strokeWidth={6}
          strokeLinecap="round"
        />
        <text
          x={fx0 + frameSize + bumper * s + 10}
          y={cy}
          dominantBaseline="middle"
          className="fill-fd-foreground text-xs font-semibold">
          Front
        </text>

        {/* The same module in each corner, turned. The drawing is from below, so mirror it for a view from above. */}
        {corners.map(({ name, turn }) => (
          <g
            key={name}
            transform={`rotate(${turn} ${cx} ${cy})`}>
            <g transform={`translate(${flx} ${fly}) scale(-1 1)`}>
              <image
                href={PLATE.src}
                x={-PLATE.offset * s}
                y={-PLATE.offset * s}
                width={PLATE.size * s}
                height={PLATE.size * s}
                className="dark:invert"
              />
            </g>
          </g>
        ))}
        {corners.map(({ name, sx, sy }) => {
          const [ax, ay] = toScreen(sx * axisIn, sy * axisIn);
          return (
            <g key={name}>
              <circle
                cx={ax}
                cy={ay}
                r={4.5}
                fill={CALLOUT}
              />
              <text
                x={ax - sx * 6}
                y={ay + (sy > 0 ? 44 : -36)}
                textAnchor={sx > 0 ? "end" : "start"}
                className="fill-fd-foreground text-[11px] font-semibold">
                {name} ({fmtM(sx * axisM)}, {fmtM(sy * axisM)})
              </text>
            </g>
          );
        })}

        {/* Distance from the center to a module. */}
        <line
          x1={cx}
          y1={cy}
          x2={toScreen(axisIn, axisIn)[0]}
          y2={toScreen(axisIn, axisIn)[1]}
          stroke={CALLOUT}
          strokeDasharray="4 4"
        />
        <text
          x={toScreen(axisIn / 2, axisIn / 2)[0] + 8}
          y={toScreen(axisIn / 2, axisIn / 2)[1] + 14}
          textAnchor="start"
          fill={CALLOUT}
          className="text-[11px]">
          R = {fmtM(Math.SQRT2 * axisM)} m
        </text>
        {/* Module spacing, along the back. */}
        {(() => {
          const x = toScreen(-HALF_FRAME - bumper - 2, 0)[0];
          const [, y0] = toScreen(0, -axisIn);
          const [, y1] = toScreen(0, axisIn);
          return (
            <g>
              <g
                stroke={MUTED}
                strokeWidth={1}>
                <line
                  x1={x}
                  x2={x}
                  y1={y0}
                  y2={y1}
                />
                <line
                  x1={x - 4}
                  x2={x + 4}
                  y1={y0}
                  y2={y0}
                />
                <line
                  x1={x - 4}
                  x2={x + 4}
                  y1={y1}
                  y2={y1}
                />
              </g>
              <text
                x={x - 6}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-fd-muted-foreground text-[11px]">
                {fmtM(2 * axisM)} m
              </text>
            </g>
          );
        })()}

        {/* Gyro at the center, with its axes. */}
        <rect
          x={cx - 12}
          y={cy - 9}
          width={24}
          height={18}
          rx={3}
          fill={GYRO}
          fillOpacity={0.3}
          stroke={GYRO}
          strokeWidth={1.5}
        />
        <line
          x1={cx + 14}
          y1={cy}
          x2={cx + 62}
          y2={cy}
          stroke={INK}
          strokeWidth={1.5}
          markerEnd="url(#layout-arrow)"
        />
        <line
          x1={cx}
          y1={cy - 11}
          x2={cx}
          y2={cy - 58}
          stroke={INK}
          strokeWidth={1.5}
          markerEnd="url(#layout-arrow)"
        />
        <text
          x={cx + 66}
          y={cy}
          dominantBaseline="middle"
          className="fill-fd-foreground text-[11px] italic">
          +x
        </text>
        <text
          x={cx + 5}
          y={cy - 62}
          className="fill-fd-foreground text-[11px] italic">
          +y
        </text>
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          fill={GYRO}
          className="text-[11px] font-semibold">
          Gyro
        </text>

        {[
          { color: FRAME, label: "Frame tube", dashed: false },
          { color: MUTED, label: "Bumpers", dashed: true },
          { color: CALLOUT, label: "Steering axis", dashed: false },
        ].map((item, i) => (
          <g
            key={item.label}
            transform={`translate(${500} ${40 + i * 22})`}>
            <line
              x1={0}
              x2={18}
              y1={0}
              y2={0}
              stroke={item.color}
              strokeWidth={3}
              strokeDasharray={item.dashed ? "4 3" : undefined}
            />
            <text
              x={26}
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
