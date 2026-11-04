import { Figure } from "./vision";

const MUTED = "var(--color-plot-muted)";
/** The color pipeline's stages. */
const COLOR = "var(--color-plot-2)";
/** The neural network's stages. */
const ML = "var(--color-plot-4)";
/** Stages both share. */
const SHARED = "var(--color-plot-3)";

/** SVG arrowhead marker with its own id, so markers don't collide on a page. */
const Arrow = ({ id, color }: { id: string; color: string }) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX="9"
    refY="5"
    markerWidth="7"
    markerHeight="7"
    orient="auto-start-reverse">
    <path
      d="M0,0 L10,5 L0,10 z"
      fill={color}
    />
  </marker>
);

const W = 116;
const H = 50;

/** A pipeline stage: a rounded box with a title and a one-line note. Positioned by its top-left corner. */
const Stage = ({ x, y, title, note, color }: { x: number; y: number; title: string; note: string; color: string }) => (
  <g>
    <rect
      x={x}
      y={y}
      width={W}
      height={H}
      rx={8}
      fill={color}
      fillOpacity={0.1}
      stroke={color}
      strokeWidth={1.5}
    />
    <text
      x={x + W / 2}
      y={y + 21}
      textAnchor="middle"
      className="fill-fd-foreground text-[12px] font-semibold">
      {title}
    </text>
    <text
      x={x + W / 2}
      y={y + 37}
      textAnchor="middle"
      className="fill-fd-muted-foreground text-[10px]">
      {note}
    </text>
  </g>
);

/** A connector between stages. */
const Link = ({ d }: { d: string }) => (
  <path
    d={d}
    fill="none"
    stroke={MUTED}
    strokeWidth={1.5}
    markerEnd="url(#od-arrow)"
  />
);

/** The stages of an object detection pipeline, with the color and neural network branches side by side. */
export const DetectionPipelineDiagram = () => {
  // Columns and rows of the layout.
  const col = [10, 150, 290, 430, 570];
  const top = 20;
  const mid = 95;
  const low = 170;
  const bottom = 260;
  return (
    <Figure caption="Every detector has the same outline. Only the middle differs: a color pipeline (top) or a neural network (bottom). Both produce a list of boxes, and everything after that is the same.">
      <svg
        viewBox="0 0 730 330"
        role="img"
        aria-label="Pipeline diagram: camera and preprocessing, then either a color branch or a neural network branch, then target selection, locating, publishing, and robot code"
        className="mx-auto h-auto w-full max-w-3xl">
        <defs>
          <Arrow
            id="od-arrow"
            color={MUTED}
          />
        </defs>

        <Stage
          x={col[0]}
          y={mid}
          title="Camera"
          note="frame + timestamp"
          color={SHARED}
        />
        <Link d={`M${col[0] + W},${mid + H / 2} L${col[1] - 4},${mid + H / 2}`} />
        <Stage
          x={col[1]}
          y={mid}
          title="Preprocess"
          note="resize, color convert"
          color={SHARED}
        />

        {/* The two branches leave from the top and bottom of Preprocess and curve into each branch. */}
        <Link
          d={`M${col[1] + W / 2},${mid} C${col[1] + W / 2},${top + H / 2} ${col[1] + W / 2 + 30},${top + H / 2} ${col[2] - 4},${top + H / 2}`}
        />
        <Link
          d={`M${col[1] + W / 2},${mid + H} C${col[1] + W / 2},${low + H / 2} ${col[1] + W / 2 + 30},${low + H / 2} ${col[2] - 4},${low + H / 2}`}
        />
        <Stage
          x={col[2]}
          y={top}
          title="HSV threshold"
          note="mask of piece color"
          color={COLOR}
        />
        <Link d={`M${col[2] + W},${top + H / 2} L${col[3] - 4},${top + H / 2}`} />
        <Stage
          x={col[3]}
          y={top}
          title="Clean up"
          note="open and close"
          color={COLOR}
        />
        <Link d={`M${col[3] + W},${top + H / 2} L${col[4] - 4},${top + H / 2}`} />
        <Stage
          x={col[4]}
          y={top}
          title="Blobs + filters"
          note="size, shape, place"
          color={COLOR}
        />
        <Stage
          x={col[2]}
          y={low}
          title="Neural network"
          note="raw boxes + scores"
          color={ML}
        />
        <Link d={`M${col[2] + W},${low + H / 2} L${col[3] - 4},${low + H / 2}`} />
        <Stage
          x={col[3]}
          y={low}
          title="Confidence cut"
          note="drop weak boxes"
          color={ML}
        />
        <Link d={`M${col[3] + W},${low + H / 2} L${col[4] - 4},${low + H / 2}`} />
        <Stage
          x={col[4]}
          y={low}
          title="NMS"
          note="drop duplicates"
          color={ML}
        />
        <text
          x={col[2]}
          y={top + H + 14}
          fill={COLOR}
          className="text-[11px] font-medium">
          Color pipeline
        </text>
        <text
          x={col[2]}
          y={low - 6}
          fill={ML}
          className="text-[11px] font-medium">
          Neural network (on a coprocessor, often with an accelerator)
        </text>

        {/* Both branches feed the shared back end. The color branch curves around the right of the network branch. */}
        <Link
          d={`M${col[4] + W},${top + H / 2} Q${col[4] + W + 30},${top + H / 2} ${col[4] + W + 30},${top + H / 2 + 30} L${col[4] + W + 30},${bottom + H / 2 - 30} Q${col[4] + W + 30},${bottom + H / 2} ${col[4] + W + 18},${bottom + H / 2} L${col[4] + W + 4},${bottom + H / 2}`}
        />
        <Link d={`M${col[4] + W / 2},${low + H} L${col[4] + W / 2},${bottom - 4}`} />
        <text
          x={col[4] + W / 2 - 8}
          y={bottom - 12}
          textAnchor="end"
          className="fill-fd-muted-foreground text-[10px]">
          list of boxes
        </text>

        <Stage
          x={col[4]}
          y={bottom}
          title="Pick a target"
          note="closest, biggest, ..."
          color={SHARED}
        />
        <Link d={`M${col[4]},${bottom + H / 2} L${col[3] + W + 4},${bottom + H / 2}`} />
        <Stage
          x={col[3]}
          y={bottom}
          title="Locate"
          note="angle and distance"
          color={SHARED}
        />
        <Link d={`M${col[3]},${bottom + H / 2} L${col[2] + W + 4},${bottom + H / 2}`} />
        <Stage
          x={col[2]}
          y={bottom}
          title="Publish"
          note="with capture time"
          color={SHARED}
        />
        <Link d={`M${col[2]},${bottom + H / 2} L${col[1] + W + 4},${bottom + H / 2}`} />
        <Stage
          x={col[1]}
          y={bottom}
          title="Robot code"
          note="track, aim, drive"
          color={SHARED}
        />
      </svg>
    </Figure>
  );
};

/** Side view of a camera looking down at a ball on the floor, with the angles used to find its distance. */
export const GroundRangeDiagram = () => {
  const floor = 200;
  const cam = { x: 70, y: 80 };
  const ball = { x: 520, r: 26 };
  const ballY = floor - ball.r;
  // The optical axis points down at about 12°, the ray to the ball center at about 13.8° (drawn steeper for clarity).
  const axisEnd = { x: 640, y: cam.y + (640 - cam.x) * Math.tan((12 * Math.PI) / 180) };
  return (
    <Figure
      caption={
        <>
          The ray through the center of the box is intersected with a level plane at the height of the ball&apos;s
          center. Only the angle below horizontal matters. It is the camera&apos;s tilt plus the angle of the box center
          below the image center.
        </>
      }>
      <svg
        viewBox="0 0 660 240"
        role="img"
        aria-label="Side view: a camera at height h, tilted down, sees a ball of radius r at horizontal distance d"
        className="mx-auto h-auto w-full max-w-2xl">
        <defs>
          <Arrow
            id="gr-dim"
            color={MUTED}
          />
        </defs>
        {/* Floor. */}
        <line
          x1={20}
          y1={floor}
          x2={640}
          y2={floor}
          className="stroke-fd-foreground"
          strokeWidth={2}
        />
        <text
          x={636}
          y={floor + 16}
          textAnchor="end"
          className="fill-fd-muted-foreground text-[11px]">
          carpet
        </text>
        {/* Horizontal through the camera, the optical axis, and the ray to the ball. */}
        <line
          x1={cam.x}
          y1={cam.y}
          x2={600}
          y2={cam.y}
          stroke={MUTED}
          strokeDasharray="4 4"
        />
        <text
          x={600}
          y={cam.y - 6}
          textAnchor="end"
          className="fill-fd-muted-foreground text-[11px]">
          horizontal
        </text>
        <line
          x1={cam.x}
          y1={cam.y}
          x2={axisEnd.x}
          y2={axisEnd.y}
          stroke={ML}
          strokeDasharray="7 4"
        />
        <text
          x={axisEnd.x}
          y={axisEnd.y - 6}
          textAnchor="end"
          fill={ML}
          className="text-[11px]">
          optical axis
        </text>
        <line
          x1={cam.x}
          y1={cam.y}
          x2={ball.x}
          y2={ballY}
          stroke={COLOR}
          strokeWidth={2}
        />
        {/* Level plane at the ball's center height. */}
        <line
          x1={cam.x}
          y1={ballY}
          x2={ball.x + 40}
          y2={ballY}
          stroke={MUTED}
          strokeDasharray="2 4"
        />
        {/* Camera body on a post. */}
        <line
          x1={cam.x}
          y1={cam.y}
          x2={cam.x}
          y2={floor}
          className="stroke-fd-muted-foreground"
          strokeWidth={3}
        />
        <rect
          x={cam.x - 16}
          y={cam.y - 10}
          width={24}
          height={20}
          rx={3}
          className="fill-fd-foreground"
          transform={`rotate(12 ${cam.x} ${cam.y})`}
        />
        {/* Ball. */}
        <circle
          cx={ball.x}
          cy={ballY}
          r={ball.r}
          fill="var(--color-fuel)"
          className="stroke-fd-foreground"
        />
        <circle
          cx={ball.x}
          cy={ballY}
          r={2.5}
          className="fill-fd-foreground"
        />
        {/* Angle arc for the ray below horizontal. */}
        <path
          d={`M${cam.x + 120},${cam.y} A120,120 0 0 1 ${cam.x + 120 * Math.cos(Math.atan2(ballY - cam.y, ball.x - cam.x))},${cam.y + 120 * Math.sin(Math.atan2(ballY - cam.y, ball.x - cam.x))}`}
          fill="none"
          stroke={COLOR}
        />
        <text
          x={cam.x + 128}
          y={cam.y + 18}
          fill={COLOR}
          className="text-[13px] italic">
          α
        </text>
        {/* Dimensions: h, r, d. */}
        <line
          x1={36}
          y1={cam.y}
          x2={36}
          y2={floor}
          stroke={MUTED}
          markerStart="url(#gr-dim)"
          markerEnd="url(#gr-dim)"
        />
        <text
          x={28}
          y={(cam.y + floor) / 2 + 4}
          textAnchor="end"
          className="fill-fd-foreground text-[13px] italic">
          h
        </text>
        <line
          x1={ball.x + 46}
          y1={ballY}
          x2={ball.x + 46}
          y2={floor}
          stroke={MUTED}
          markerStart="url(#gr-dim)"
          markerEnd="url(#gr-dim)"
        />
        <text
          x={ball.x + 54}
          y={ballY + 18}
          className="fill-fd-foreground text-[13px] italic">
          r
        </text>
        <line
          x1={cam.x}
          y1={floor + 22}
          x2={ball.x}
          y2={floor + 22}
          stroke={MUTED}
          markerStart="url(#gr-dim)"
          markerEnd="url(#gr-dim)"
        />
        <text
          x={(cam.x + ball.x) / 2}
          y={floor + 18}
          textAnchor="middle"
          className="fill-fd-foreground text-[13px] italic">
          d
        </text>
        <text
          x={cam.x + 4}
          y={cam.y - 18}
          className="fill-fd-foreground text-[12px]">
          camera
        </text>
      </svg>
    </Figure>
  );
};
