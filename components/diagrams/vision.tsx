import { TAG_PATTERN } from "@/lib/vision";

import type { ReactNode } from "react";

/** Figure frame shared by the static diagrams: a bordered card with a caption. */
const Figure = ({ caption, children }: { caption: ReactNode; children: ReactNode }) => (
  <figure className="not-prose my-6 rounded-xl border border-fd-border bg-fd-card p-4">
    {children}
    <figcaption className="mt-2 text-center text-xs text-fd-muted-foreground">{caption}</figcaption>
  </figure>
);

/** SVG arrowhead marker. Give each diagram its own `id` so markers don't collide on a page. */
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

const INK = "var(--color-tag-ink)";
const PAPER = "var(--color-tag-paper)";
const MUTED = "var(--color-plot-muted)";
/** Anything measured from the image (corners, camera-to-tag transforms). Blue in both themes. */
const MEASURED = "var(--color-plot-4)";
const KNOWN = "var(--color-plot-2)";

/** A tag drawn at `(x, y)` with `cell` pixels per cell: white border, black border, and the illustrative data bits. */
const TagGlyph = ({ x, y, cell }: { x: number; y: number; cell: number }) => (
  <g>
    <rect
      x={x}
      y={y}
      width={cell * 10}
      height={cell * 10}
      fill={PAPER}
      stroke={MUTED}
    />
    <rect
      x={x + cell}
      y={y + cell}
      width={cell * 8}
      height={cell * 8}
      fill={INK}
    />
    {TAG_PATTERN.flatMap((row, r) =>
      row.map((bit, c) =>
        bit ? null : (
          <rect
            key={`${r}-${c}`}
            x={x + (c + 2) * cell}
            y={y + (r + 2) * cell}
            width={cell}
            height={cell}
            fill={PAPER}
          />
        )
      )
    )}
  </g>
);

/** Labeled parts of an FRC AprilTag: borders, data bits, corners, and size. */
export const AprilTagAnatomy = () => {
  const cell = 22;
  const x0 = 40;
  const y0 = 30;
  const label = (x: number, y: number, tx: number, ty: number, text: string, sub?: string) => (
    <g>
      <line
        x1={x}
        y1={y}
        x2={tx - 6}
        y2={ty}
        stroke={MUTED}
      />
      <circle
        cx={x}
        cy={y}
        r={3}
        fill={MEASURED}
      />
      <text
        x={tx}
        y={ty}
        dominantBaseline="middle"
        className="fill-fd-foreground text-[13px] font-medium">
        {text}
      </text>
      {sub && (
        <text
          x={tx}
          y={ty + 16}
          dominantBaseline="middle"
          className="fill-fd-muted-foreground text-[11px]">
          {sub}
        </text>
      )}
    </g>
  );
  const corners: [number, number][] = [
    [x0 + cell, y0 + cell],
    [x0 + 9 * cell, y0 + cell],
    [x0 + 9 * cell, y0 + 9 * cell],
    [x0 + cell, y0 + 9 * cell],
  ];
  return (
    <Figure caption="An illustrative tag. The data pattern is made up, not a real 36h11 code.">
      <svg
        viewBox="0 0 640 300"
        role="img"
        aria-label="AprilTag anatomy: white border, black border, six by six data bits, four corners, and the 6.5 inch black square"
        className="mx-auto h-auto w-full max-w-2xl">
        <TagGlyph
          x={x0}
          y={y0}
          cell={cell}
        />
        {corners.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={5}
            fill="none"
            stroke={MEASURED}
            strokeWidth={2.5}
          />
        ))}
        {/* Size of the black square. */}
        <line
          x1={x0 + cell}
          x2={x0 + 9 * cell}
          y1={y0 + 10 * cell + 16}
          y2={y0 + 10 * cell + 16}
          stroke={MUTED}
          markerStart="url(#tag-dim)"
          markerEnd="url(#tag-dim)"
        />
        <defs>
          <Arrow
            id="tag-dim"
            color={MUTED}
          />
        </defs>
        <text
          x={x0 + 5 * cell}
          y={y0 + 10 * cell + 34}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-[12px]">
          6.5 in (165.1 mm) black square
        </text>
        {label(x0 + 9.5 * cell, y0 + 0.5 * cell, 330, 40, "White border", "Separates the tag from the background")}
        {label(x0 + 8.5 * cell, y0 + 2.5 * cell, 330, 95, "Black border (1 cell)", "What the detector finds first")}
        {label(x0 + 6.5 * cell, y0 + 5.5 * cell, 330, 150, "6 × 6 data cells", "36 bits that encode the tag ID")}
        {label(corners[2][0], corners[2][1], 330, 205, "4 corners", "The detector's main output. PnP uses these.")}
      </svg>
    </Figure>
  );
};

/** Top-down view of the field, tag, robot, and camera frames, with the transforms that link them. */
export const FrameChain = () => (
  <Figure
    caption={
      <>
        Orange transforms are known ahead of time (field layout and camera mount). The blue one is measured by the
        solver every frame. Chaining them gives the robot&apos;s pose on the field.
      </>
    }>
    <svg
      viewBox="0 0 640 338"
      role="img"
      aria-label="Coordinate frames: field origin, tag, robot, and camera, linked by transforms"
      className="mx-auto h-auto w-full max-w-2xl">
      <defs>
        <Arrow
          id="fc-known"
          color={KNOWN}
        />
        <Arrow
          id="fc-meas"
          color={MEASURED}
        />
        <Arrow
          id="fc-axis"
          color={MUTED}
        />
      </defs>
      {/* Field outline. */}
      <rect
        x={20}
        y={20}
        width={600}
        height={290}
        rx={8}
        fill="none"
        className="stroke-fd-border"
        strokeWidth={2}
      />
      {/* Field origin and axes. */}
      <line
        x1={30}
        y1={300}
        x2={90}
        y2={300}
        stroke={MUTED}
        strokeWidth={2}
        markerEnd="url(#fc-axis)"
      />
      <line
        x1={30}
        y1={300}
        x2={30}
        y2={240}
        stroke={MUTED}
        strokeWidth={2}
        markerEnd="url(#fc-axis)"
      />
      <text
        x={95}
        y={304}
        className="fill-fd-muted-foreground text-[12px]">
        x
      </text>
      <text
        x={37}
        y={250}
        className="fill-fd-muted-foreground text-[12px]">
        y
      </text>
      <text
        x={30}
        y={331}
        className="fill-fd-foreground text-[13px] font-medium">
        F (field origin)
      </text>
      {/* Tag on the right wall, facing left. */}
      <rect
        x={600}
        y={92}
        width={12}
        height={36}
        fill={INK}
        className="dark:fill-fd-foreground"
      />
      <line
        x1={600}
        y1={110}
        x2={560}
        y2={110}
        stroke={MUTED}
        strokeWidth={2}
        markerEnd="url(#fc-axis)"
      />
      <text
        x={588}
        y={146}
        textAnchor="middle"
        className="fill-fd-foreground text-[13px] font-medium">
        A (tag)
      </text>
      {/* Robot with its camera. */}
      <g transform="translate(300 190) rotate(-20)">
        <rect
          x={-40}
          y={-32}
          width={80}
          height={64}
          rx={6}
          className="fill-fd-muted stroke-fd-muted-foreground"
          strokeWidth={2}
        />
        <line
          x1={0}
          y1={0}
          x2={34}
          y2={0}
          stroke={MUTED}
          strokeWidth={2}
          markerEnd="url(#fc-axis)"
        />
        <circle
          r={3}
          fill={MUTED}
        />
        <rect
          x={30}
          y={-26}
          width={12}
          height={12}
          rx={2}
          fill={MEASURED}
        />
      </g>
      <text
        x={300}
        y={258}
        textAnchor="middle"
        className="fill-fd-foreground text-[13px] font-medium">
        R (robot)
      </text>
      <text
        x={345}
        y={138}
        textAnchor="middle"
        className="fill-fd-foreground text-[13px] font-medium">
        C (camera)
      </text>
      {/* Transforms. */}
      <path
        d="M40,295 C200,60 420,40 594,104"
        fill="none"
        stroke={KNOWN}
        strokeWidth={2}
        strokeDasharray="6 4"
        markerEnd="url(#fc-known)"
      />
      <text
        x={250}
        y={70}
        textAnchor="middle"
        fill={KNOWN}
        className="text-[13px]">
        field → tag: from the field layout
      </text>
      <path
        d="M300,190 L336,164"
        fill="none"
        stroke={KNOWN}
        strokeWidth={2}
        markerEnd="url(#fc-known)"
      />
      <text
        x={360}
        y={214}
        fill={KNOWN}
        className="text-[12px]">
        robot → camera: the mount
      </text>
      <path
        d="M348,166 L594,112"
        fill="none"
        stroke={MEASURED}
        strokeWidth={2.5}
        markerEnd="url(#fc-meas)"
      />
      <text
        x={480}
        y={186}
        textAnchor="middle"
        fill={MEASURED}
        className="text-[13px] font-medium">
        camera → tag: measured (PnP)
      </text>
    </svg>
  </Figure>
);

/** Side-by-side sketch of relative positioning (one tag) and global positioning (field pose from all tags). */
export const RelativeGlobalDiagram = () => {
  const robot = (x: number, y: number, rot: number) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect
        x={-18}
        y={-15}
        width={36}
        height={30}
        rx={4}
        className="fill-fd-muted stroke-fd-muted-foreground"
        strokeWidth={2}
      />
      <line
        x1={0}
        y1={0}
        x2={16}
        y2={0}
        stroke={MUTED}
        strokeWidth={2}
      />
    </g>
  );
  const tag = (x: number, y: number, vertical = true) => (
    <rect
      x={vertical ? x - 4 : x - 14}
      y={vertical ? y - 14 : y - 4}
      width={vertical ? 8 : 28}
      height={vertical ? 28 : 8}
      fill={INK}
      className="dark:fill-fd-foreground"
    />
  );
  return (
    <Figure caption="Left: the robot only cares where it is relative to one tag. Right: the robot tracks its pose in field coordinates, and every tag it sees helps.">
      <svg
        viewBox="0 0 660 260"
        role="img"
        aria-label="Relative positioning compared with global positioning"
        className="mx-auto h-auto w-full max-w-3xl">
        <defs>
          <Arrow
            id="rg-meas"
            color={MEASURED}
          />
          <Arrow
            id="rg-known"
            color={KNOWN}
          />
        </defs>
        {/* Relative. */}
        <text
          x={160}
          y={22}
          textAnchor="middle"
          className="fill-fd-foreground text-[14px] font-semibold">
          Relative
        </text>
        <rect
          x={10}
          y={34}
          width={300}
          height={214}
          rx={8}
          fill="none"
          className="stroke-fd-border"
          strokeDasharray="4 4"
        />
        {tag(280, 120)}
        <circle
          cx={236}
          cy={120}
          r={6}
          fill="none"
          stroke={KNOWN}
          strokeWidth={2.5}
        />
        <text
          x={236}
          y={100}
          textAnchor="middle"
          fill={KNOWN}
          className="text-[11px]">
          target
        </text>
        {robot(80, 180, -20)}
        <line
          x1={98}
          y1={172}
          x2={272}
          y2={124}
          stroke={MEASURED}
          strokeWidth={2.5}
          markerEnd="url(#rg-meas)"
        />
        <text
          x={150}
          y={130}
          textAnchor="middle"
          fill={MEASURED}
          className="text-[12px]">
          camera → tag
        </text>
        <line
          x1={276}
          y1={120}
          x2={246}
          y2={120}
          stroke={KNOWN}
          strokeWidth={2}
          markerEnd="url(#rg-known)"
        />
        <text
          x={160}
          y={234}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-[11px]">
          No field layout. Only this tag counts.
        </text>
        {/* Global. */}
        <text
          x={495}
          y={22}
          textAnchor="middle"
          className="fill-fd-foreground text-[14px] font-semibold">
          Global
        </text>
        <rect
          x={340}
          y={34}
          width={310}
          height={214}
          rx={8}
          fill="none"
          className="stroke-fd-border"
          strokeWidth={2}
        />
        {tag(640, 90)}
        {tag(640, 170)}
        {tag(500, 44, false)}
        {tag(350, 140)}
        <circle
          cx={596}
          cy={90}
          r={6}
          fill="none"
          stroke={KNOWN}
          strokeWidth={2.5}
        />
        {robot(470, 170, 10)}
        <line
          x1={346}
          y1={242}
          x2={452}
          y2={178}
          stroke={KNOWN}
          strokeWidth={2}
          strokeDasharray="6 4"
          markerEnd="url(#rg-known)"
        />
        <text
          x={372}
          y={206}
          fill={KNOWN}
          className="text-[11px]">
          field pose
        </text>
        {[
          [632, 94],
          [632, 168],
          [500, 52],
        ].map(([x, y], i) => (
          <line
            key={i}
            x1={484}
            y1={166}
            x2={x}
            y2={y}
            stroke={MEASURED}
            strokeWidth={1.5}
            strokeOpacity={0.8}
            markerEnd="url(#rg-meas)"
          />
        ))}
        <text
          x={495}
          y={234}
          textAnchor="middle"
          className="fill-fd-muted-foreground text-[11px]">
          Field layout + odometry. Any tag counts.
        </text>
      </svg>
    </Figure>
  );
};

/** Side view of the pinhole model: similar triangles give the image coordinate of a point. */
export const PinholeDiagram = () => (
  <Figure
    caption={
      <>
        The image plane is drawn in front of the pinhole, as is usual in computer vision. A point at height Y and depth
        Z lands at y = f · Y / Z on the image plane.
      </>
    }>
    <svg
      viewBox="0 0 640 230"
      role="img"
      aria-label="Pinhole camera side view with similar triangles"
      className="mx-auto h-auto w-full max-w-2xl">
      <defs>
        <Arrow
          id="ph-dim"
          color={MUTED}
        />
      </defs>
      {/* Optical axis. */}
      <line
        x1={40}
        y1={170}
        x2={620}
        y2={170}
        stroke={MUTED}
        strokeDasharray="5 5"
      />
      <text
        x={612}
        y={188}
        textAnchor="end"
        className="fill-fd-muted-foreground text-[11px]">
        optical axis (z)
      </text>
      {/* Ray, drawn first so the pinhole and the point sit on top of it. */}
      <line
        x1={60}
        y1={170}
        x2={540}
        y2={50}
        stroke={KNOWN}
        strokeWidth={2}
      />
      {/* Pinhole. */}
      <circle
        cx={60}
        cy={170}
        r={5}
        className="fill-fd-foreground"
      />
      <text
        x={60}
        y={196}
        textAnchor="middle"
        className="fill-fd-foreground text-[12px]">
        pinhole
      </text>
      {/* Image plane. */}
      <line
        x1={180}
        y1={60}
        x2={180}
        y2={200}
        stroke={MEASURED}
        strokeWidth={3}
      />
      <text
        x={180}
        y={50}
        textAnchor="middle"
        fill={MEASURED}
        className="text-[12px]">
        image plane
      </text>
      {/* Where the ray crosses the image plane, on top of both. */}
      <circle
        cx={180}
        cy={140}
        r={4}
        fill={KNOWN}
      />
      {/* Object. */}
      <line
        x1={540}
        y1={170}
        x2={540}
        y2={50}
        className="stroke-fd-foreground"
        strokeWidth={3}
      />
      <circle
        cx={540}
        cy={50}
        r={5}
        fill={KNOWN}
      />
      <text
        x={552}
        y={54}
        fill={KNOWN}
        className="text-[12px]">
        P
      </text>
      {/* Dimensions. */}
      <line
        x1={60}
        y1={215}
        x2={180}
        y2={215}
        stroke={MUTED}
        markerStart="url(#ph-dim)"
        markerEnd="url(#ph-dim)"
      />
      <text
        x={120}
        y={210}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[12px]">
        f
      </text>
      <line
        x1={60}
        y1={30}
        x2={540}
        y2={30}
        stroke={MUTED}
        markerStart="url(#ph-dim)"
        markerEnd="url(#ph-dim)"
      />
      <text
        x={300}
        y={24}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[12px]">
        Z (depth)
      </text>
      <line
        x1={200}
        y1={170}
        x2={200}
        y2={142}
        stroke={MUTED}
        markerStart="url(#ph-dim)"
        markerEnd="url(#ph-dim)"
      />
      <text
        x={208}
        y={160}
        className="fill-fd-muted-foreground text-[12px]">
        y
      </text>
      <line
        x1={560}
        y1={170}
        x2={560}
        y2={58}
        stroke={MUTED}
        markerStart="url(#ph-dim)"
        markerEnd="url(#ph-dim)"
      />
      <text
        x={568}
        y={120}
        className="fill-fd-muted-foreground text-[12px]">
        Y
      </text>
    </svg>
  </Figure>
);

/** Exposure timing of each image row, for a global shutter and for a rolling shutter. */
export const ShutterTimeline = () => {
  const rows = 8;
  const rowY = (i: number) => 44 + i * 18;
  const panel = (x0: number, title: string, rolling: boolean, id: string) => (
    <g>
      <text
        x={x0 + 150}
        y={20}
        textAnchor="middle"
        className="fill-fd-foreground text-[13px] font-medium">
        {title}
      </text>
      <text
        x={x0 + 52}
        y={rowY(0) + 10}
        textAnchor="end"
        className="fill-fd-muted-foreground text-[11px]">
        top row
      </text>
      <text
        x={x0 + 52}
        y={rowY(rows - 1) + 10}
        textAnchor="end"
        className="fill-fd-muted-foreground text-[11px]">
        bottom row
      </text>
      {Array.from({ length: rows }, (_, i) => (
        <rect
          key={i}
          x={x0 + 64 + (rolling ? i * 20 : 0)}
          y={rowY(i)}
          width={60}
          height={12}
          rx={2}
          fill="var(--color-plot-1)"
          fillOpacity={0.55}
        />
      ))}
      {/* Time axis. */}
      <line
        x1={x0 + 60}
        y1={196}
        x2={x0 + 292}
        y2={196}
        stroke={MUTED}
        markerEnd={`url(#${id})`}
      />
      <text
        x={x0 + 290}
        y={212}
        textAnchor="end"
        className="fill-fd-muted-foreground text-[11px]">
        time
      </text>
      {/* Exposure bracket over the first row. */}
      <line
        x1={x0 + 64}
        y1={rowY(0) - 6}
        x2={x0 + 124}
        y2={rowY(0) - 6}
        stroke={MUTED}
      />
      <text
        x={x0 + 94}
        y={rowY(0) - 10}
        textAnchor="middle"
        className="fill-fd-muted-foreground text-[11px]">
        exposure
      </text>
      {rolling ? (
        <>
          <line
            x1={x0 + 64}
            y1={186}
            x2={x0 + 64 + (rows - 1) * 20}
            y2={186}
            stroke="var(--color-plot-2)"
            strokeWidth={2}
          />
          <text
            x={x0 + 64 + ((rows - 1) * 20) / 2}
            y={182}
            textAnchor="middle"
            fill="var(--color-plot-2)"
            className="text-[11px]">
            readout time
          </text>
        </>
      ) : (
        <text
          x={x0 + 130}
          y={186}
          className="fill-fd-muted-foreground text-[11px]">
          every row at once
        </text>
      )}
    </g>
  );
  return (
    <Figure
      caption={
        <>
          Each bar is one row&apos;s exposure. A global shutter exposes every row over the same moment. A rolling
          shutter starts each row a little later than the one above it, so the bottom of the image is captured one
          readout time after the top.
        </>
      }>
      <svg
        viewBox="0 0 640 220"
        role="img"
        aria-label="Row exposure timing for a global shutter and a rolling shutter"
        className="mx-auto h-auto w-full max-w-2xl">
        <defs>
          <Arrow
            id="st-time"
            color={MUTED}
          />
        </defs>
        {panel(0, "Global shutter", false, "st-time")}
        {panel(330, "Rolling shutter", true, "st-time")}
      </svg>
    </Figure>
  );
};
