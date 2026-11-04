"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  buildScene,
  cleanMask,
  colorPipelineMs,
  downsample,
  exposeImage,
  findBlobs,
  horizonRow,
  hsvThreshold,
  locateBall,
  matchDetections,
  networkMs,
  nms,
  pickTarget,
  PIECES,
  PLAYGROUND_CAMERA,
  rejectReason,
  renderScene,
  simulateNetwork,
  truthLocation,
  truthPieces,
} from "@/lib/object-detection";

import { fmt, Readout, Segmented, Slider, Widget } from "./controls";

import type {
  Accelerator,
  Box2,
  BlobFilter,
  HsvRange,
  PieceId,
  RejectReason,
  SceneId,
  TargetRule,
} from "@/lib/object-detection";

type Detector = "color" | "ml";

const STAGES: Record<Detector, { name: string; note: string }[]> = {
  color: [
    {
      name: "Capture",
      note: "The camera image. Set up the scene, the venue lighting, and the camera here. Every later stage starts from this image.",
    },
    {
      name: "Threshold",
      note: "Each pixel is converted to HSV and kept (white) if its hue, saturation, and value are all inside the range. This is the only step that knows what color the piece is.",
    },
    {
      name: "Clean up",
      note: "Opening (shrink, then grow) removes specks of noise. Closing (grow, then shrink) fills holes, such as the glare spot on top of a ball.",
    },
    {
      name: "Filter blobs",
      note: "Touching white pixels are grouped into blobs. Each blob is kept (solid box) or rejected (dashed box) by its size, its shape, and where it is in the image.",
    },
    {
      name: "Pick and locate",
      note: "One blob becomes the target, and its box turns into an angle and a distance on the floor. Dashed boxes mark pieces the pipeline missed.",
    },
  ],
  ml: [
    {
      name: "Capture",
      note: "The camera image. Set up the scene, the venue lighting, and the camera here. Every later stage starts from this image.",
    },
    {
      name: "Resize",
      note: "The network takes a fixed, square input. The image is scaled down to fit and padded with gray bars. This is the image the network actually sees.",
    },
    {
      name: "Network",
      note: "The network outputs many candidate boxes, each with a confidence. Brighter boxes are more confident. Most are duplicates or clutter.",
    },
    {
      name: "Threshold and NMS",
      note: "Boxes below the confidence threshold are dropped. Non-maximum suppression then drops any box that overlaps a more confident one too much (dashed).",
    },
    {
      name: "Pick and locate",
      note: "One box becomes the target, and its box turns into an angle and a distance on the floor. Dashed boxes mark pieces the detector missed.",
    },
  ],
};

const REASON_LABEL: Record<RejectReason, string> = {
  area: "too small",
  aspect: "wrong shape",
  fill: "too hollow",
  horizon: "above horizon",
};

const K = PLAYGROUND_CAMERA;
/** Gray used to pad the network input, as YOLO-style letterboxing does. */
const PAD_GRAY = 114;

/** A mask as an RGBA image: white where kept, black elsewhere. */
const maskToRgba = (mask: Uint8Array) => {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 255 : 0;
    out[4 * i] = v;
    out[4 * i + 1] = v;
    out[4 * i + 2] = v;
    out[4 * i + 3] = 255;
  }
  return out;
};

/** Scales the image down to the model input and pads it to a square, centered vertically. */
const letterbox = (img: Uint8ClampedArray, size: number) => {
  const small = downsample(img, K.width, K.height, K.width / size);
  const out = new Uint8ClampedArray(size * size * 4).fill(PAD_GRAY);
  const top = Math.floor((size - small.height) / 2);
  for (let y = 0; y < small.height; y++)
    out.set(small.img.subarray(y * small.width * 4, (y + 1) * small.width * 4), (y + top) * size * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
};

/** Draws RGBA pixels into a canvas, scaled up by CSS to fill its box. */
const PixelCanvas = ({
  data,
  width,
  height,
  label,
  className,
}: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  label: string;
  className?: string;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  }, [data, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full [image-rendering:pixelated]", className)}
    />
  );
};

/** A box drawn over the image, in playground camera pixels. */
const BoxMark = ({
  box,
  color,
  dashed,
  width = 2,
  opacity = 1,
  label,
}: {
  box: Box2;
  color: string;
  dashed?: boolean;
  width?: number;
  opacity?: number;
  label?: string;
}) => (
  <g opacity={opacity}>
    <rect
      x={box.x0}
      y={box.y0}
      width={Math.max(1, box.x1 - box.x0)}
      height={Math.max(1, box.y1 - box.y0)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dashed ? "5 3" : undefined}
    />
    {label && (
      <text
        x={box.x0}
        y={box.y0 > 14 ? box.y0 - 4 : box.y1 + 12}
        fill={color}
        stroke="var(--color-fd-background)"
        strokeWidth={3}
        paintOrder="stroke"
        className="text-[11px] font-medium">
        {label}
      </text>
    )}
  </g>
);

const scaleBox = (b: Box2, s: number): Box2 => ({ x0: b.x0 * s, y0: b.y0 * s, x1: b.x1 * s, y1: b.y1 * s });

/** Width and height of an image. */
const size = (s: { width: number; height: number }) => ({ width: s.width, height: s.height });

/** Darkens an RGBA image, so boxes drawn over it stand out. */
const dim = (img: Uint8ClampedArray, k = 0.55) => {
  const out = new Uint8ClampedArray(img);
  for (let i = 0; i < out.length; i += 4) {
    out[i] *= k;
    out[i + 1] *= k;
    out[i + 2] *= k;
  }
  return out;
};

/**
 * An end-to-end object detection playground. A simulated camera looks at game pieces, robots, and the stands. The
 * reader steps through a color pipeline or a (simulated) neural network detector stage by stage, sees each stage's
 * output, and tunes that stage's settings.
 */
export const DetectionPlayground = () => {
  const [detector, setDetector] = useState<Detector>("color");
  const [stage, setStage] = useState(0);

  // Capture.
  const [pieceId, setPieceId] = useState<PieceId>("fuel");
  const [sceneId, setSceneId] = useState<SceneId>("scattered");
  const [height, setHeight] = useState(0.6);
  const [pitch, setPitch] = useState(10);
  const [brightness, setBrightness] = useState(1);
  const [cast, setCast] = useState(0);
  const [exposure, setExposure] = useState(1);
  const [noise, setNoise] = useState(4);

  // Color pipeline.
  const [hsv, setHsv] = useState<HsvRange>(PIECES.fuel.hsv);
  const [factor, setFactor] = useState(1);
  const [open, setOpen] = useState(1);
  const [close, setClose] = useState(1);
  const [filter, setFilter] = useState<BlobFilter>({
    minAreaPct: 0.01,
    maxAspect: 2,
    minFill: 0.5,
    belowHorizon: true,
  });

  // Network.
  const [inputSize, setInputSize] = useState(320);
  const [training, setTraining] = useState<"varied" | "single">("varied");
  const [hw, setHw] = useState<Accelerator>("npu");
  const [confidence, setConfidence] = useState(0.5);
  const [nmsIou, setNmsIou] = useState(0.45);

  const [rule, setRule] = useState<TargetRule>("lowest");

  // Rendering takes a moment, so let the sliders move ahead of it.
  const mount = useDeferredValue(useMemo(() => ({ height, pitchDeg: pitch }), [height, pitch]));
  const light = useDeferredValue(
    useMemo(() => ({ brightness, cast, exposure, noise }), [brightness, cast, exposure, noise])
  );

  const scene = useMemo(() => buildScene(pieceId, sceneId), [pieceId, sceneId]);
  const rendered = useMemo(() => renderScene(scene, mount), [scene, mount]);
  const image = useMemo(() => exposeImage(rendered, light), [rendered, light]);
  const truth = useMemo(() => truthPieces(scene, rendered), [scene, rendered]);
  const horizon = horizonRow(K, mount);

  // Color pipeline, at the processing resolution.
  const color = useMemo(() => {
    const small = downsample(image, K.width, K.height, factor);
    const { width, height: h } = small;
    const mask = hsvThreshold(small.img, width, h, hsv);
    const cleaned = cleanMask(mask, width, h, open, close);
    const blobs = findBlobs(cleaned, width, h).map((b) => ({
      ...b,
      reason: rejectReason(b, filter, width * h, horizon / factor),
    }));
    const kept = mask.reduce((s, v) => s + v, 0);
    return { small, mask, cleaned, blobs, keptFraction: kept / mask.length };
  }, [image, factor, hsv, open, close, filter, horizon]);

  // Network.
  const network = useMemo(() => {
    const candidates = simulateNetwork(scene, rendered, image, light, { inputSize, training });
    const above = candidates.filter((c) => c.confidence >= confidence);
    const suppressedBy = nms(
      above.map((c) => c.box),
      nmsIou
    );
    return { candidates, above, suppressedBy };
  }, [scene, rendered, image, light, inputSize, training, confidence, nmsIou]);

  const input = useMemo(
    () => (detector === "ml" && stage === 1 ? letterbox(image, inputSize) : null),
    [detector, stage, image, inputSize]
  );

  // Final detections in playground camera pixels.
  const detections = useMemo(
    () =>
      detector === "color"
        ? color.blobs.filter((b) => !b.reason).map((b) => ({ box: scaleBox(b.box, factor), score: b.area }))
        : network.above.filter((_, i) => network.suppressedBy[i] < 0).map((c) => ({ box: c.box, score: c.confidence })),
    [detector, color, network, factor]
  );
  const match = useMemo(
    () =>
      matchDetections(
        detections.map((d) => d.box),
        truth
      ),
    [detections, truth]
  );
  const found = new Set(match.filter((m) => m >= 0));
  const falsePositives = match.filter((m) => m < 0).length;
  const target = pickTarget(detections, detector === "color" && rule === "confident" ? "lowest" : rule, K);
  const located = target >= 0 ? locateBall(detections[target].box, rendered, scene.piece.diameter / 2) : null;
  const targetTruth = target >= 0 && match[target] >= 0 ? truthLocation(truth[match[target]], rendered) : null;

  const ms =
    detector === "color" ? colorPipelineMs((K.width / factor) * (K.height / factor)) : networkMs(inputSize, hw);

  const choosePiece = (p: PieceId) => {
    setPieceId(p);
    setHsv(PIECES[p].hsv);
  };
  const chooseDetector = (d: Detector) => {
    setDetector(d);
    if (d === "color" && rule === "confident") setRule("lowest");
  };

  const stages = STAGES[detector];
  const summaries =
    detector === "color"
      ? [
          `${truth.length} pieces in view`,
          `${fmt(color.keptFraction * 100, 2)}% of pixels kept`,
          `${color.blobs.length} blobs`,
          `${detections.length} of ${color.blobs.length} kept`,
          located ? `${fmt(located.distance, 2)} m, ${fmt(Math.abs(located.yawDeg), 2)}°` : "no target",
        ]
      : [
          `${truth.length} pieces in view`,
          `${inputSize}×${inputSize} input`,
          `${network.candidates.length} raw boxes`,
          `${detections.length} kept`,
          located ? `${fmt(located.distance, 2)} m, ${fmt(Math.abs(located.yawDeg), 2)}°` : "no target",
        ];

  // What the image panel shows for the selected stage.
  let view: { data: Uint8ClampedArray; width: number; height: number; label: string };
  if (stage === 0) view = { data: image, width: K.width, height: K.height, label: "Camera image" };
  else if (detector === "color" && stage === 1)
    view = { data: maskToRgba(color.mask), ...size(color.small), label: "Threshold mask" };
  else if (detector === "color" && stage === 2)
    view = { data: maskToRgba(color.cleaned), ...size(color.small), label: "Cleaned mask" };
  else if (detector === "color" && stage === 3)
    view = { data: dim(color.small.img), ...size(color.small), label: "Image at processing resolution with blobs" };
  else if (detector === "ml" && stage === 1 && input)
    view = { data: input, width: inputSize, height: inputSize, label: "Network input" };
  else view = { data: dim(image), width: K.width, height: K.height, label: "Camera image with detections" };

  const horizonLine = (stage === 3 && detector === "color" && filter.belowHorizon) || stage === 4;

  const overlay = (
    <svg
      viewBox={`0 0 ${K.width} ${K.height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full">
      {horizonLine && horizon > 0 && horizon < K.height && (
        <g>
          <line
            x1={0}
            x2={K.width}
            y1={horizon}
            y2={horizon}
            stroke="var(--color-plot-muted)"
            strokeDasharray="6 4"
          />
          <text
            x={6}
            y={horizon - 4}
            fill="var(--color-plot-muted)"
            className="text-[11px]">
            horizon
          </text>
        </g>
      )}
      {detector === "color" &&
        stage === 3 &&
        color.blobs.map((b, i) => (
          <BoxMark
            key={i}
            box={scaleBox(b.box, factor)}
            color={b.reason ? "var(--color-plot-muted)" : "var(--color-plot-3)"}
            dashed={!!b.reason}
            width={b.reason ? 1.5 : 2.5}
            label={b.reason ? REASON_LABEL[b.reason] : undefined}
          />
        ))}
      {detector === "ml" &&
        stage === 2 &&
        network.candidates.map((c, i) => (
          <BoxMark
            key={i}
            box={c.box}
            color="var(--color-plot-4)"
            opacity={0.25 + 0.75 * c.confidence}
            width={1 + 2 * c.confidence}
            label={c.confidence >= 0.3 ? fmt(c.confidence, 2) : undefined}
          />
        ))}
      {detector === "ml" &&
        stage === 3 &&
        network.above.map((c, i) => (
          <BoxMark
            key={i}
            box={c.box}
            color={network.suppressedBy[i] >= 0 ? "var(--color-plot-muted)" : "var(--color-plot-3)"}
            dashed={network.suppressedBy[i] >= 0}
            width={network.suppressedBy[i] >= 0 ? 1.5 : 2.5}
            label={network.suppressedBy[i] >= 0 ? undefined : fmt(c.confidence, 2)}
          />
        ))}
      {stage === 4 && (
        <>
          {truth.map((t, j) =>
            found.has(j) ? null : (
              <BoxMark
                key={`t${j}`}
                box={t.box}
                color="var(--color-plot-2)"
                dashed
                width={1.5}
                label="missed"
              />
            )
          )}
          {detections.map((d, i) => (
            <BoxMark
              key={i}
              box={d.box}
              color={i === target ? "var(--color-plot-1)" : "var(--color-plot-3)"}
              width={i === target ? 3.5 : 2}
              label={i === target ? "target" : match[i] < 0 ? "false" : undefined}
            />
          ))}
          {target >= 0 && (
            <path
              d={`M${(detections[target].box.x0 + detections[target].box.x1) / 2 - 10},${(detections[target].box.y0 + detections[target].box.y1) / 2} h20 M${(detections[target].box.x0 + detections[target].box.x1) / 2},${(detections[target].box.y0 + detections[target].box.y1) / 2 - 10} v20`}
              stroke="var(--color-plot-1)"
              strokeWidth={2}
            />
          )}
        </>
      )}
    </svg>
  );

  return (
    <Widget title="Object detection pipeline playground">
      <div className="flex flex-wrap gap-4">
        <Segmented
          label="Detector"
          value={detector}
          onChange={chooseDetector}
          options={[
            { value: "color", label: "Color" },
            { value: "ml", label: "Machine learning" },
          ]}
        />
        <Segmented
          label="Game piece"
          value={pieceId}
          onChange={choosePiece}
          options={[
            { value: "fuel", label: "Fuel (yellow, 15 cm)" },
            { value: "algae", label: "Algae (teal, 41 cm)" },
          ]}
        />
        <Segmented
          label="Scene"
          value={sceneId}
          onChange={setSceneId}
          options={[
            { value: "scattered", label: "Scattered" },
            { value: "cluster", label: "Pile" },
            { value: "robots", label: "Robots" },
          ]}
        />
      </div>

      <ol
        aria-label="Pipeline stages"
        className="flex flex-wrap items-stretch gap-1.5">
        {stages.map((s, i) => (
          <Fragment key={s.name}>
            {i > 0 && (
              <li
                aria-hidden
                className="flex items-center text-fd-muted-foreground">
                →
              </li>
            )}
            <li className="min-w-0 flex-1 basis-28">
              <button
                type="button"
                aria-pressed={i === stage}
                onClick={() => setStage(i)}
                className={cn(
                  "flex h-full w-full flex-col rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  i === stage ? "border-fd-primary bg-fd-primary/10" : "border-fd-border hover:bg-fd-accent"
                )}>
                <span className="text-xs font-semibold">
                  {i + 1}. {s.name}
                </span>
                <span className="font-mono text-[11px] text-fd-muted-foreground tabular-nums">{summaries[i]}</span>
              </button>
            </li>
          </Fragment>
        ))}
      </ol>

      <figure className="m-0">
        <div
          className={cn(
            "relative mx-auto overflow-hidden rounded-md border border-fd-border",
            view.width === view.height ? "max-w-sm" : "w-full"
          )}>
          <PixelCanvas
            data={view.data}
            width={view.width}
            height={view.height}
            label={view.label}
          />
          {view.width !== view.height && overlay}
        </div>
        <figcaption className="mt-1 text-xs text-fd-muted-foreground">{stages[stage].note}</figcaption>
      </figure>

      <StageControls
        {...{
          detector,
          stage,
          height,
          setHeight,
          pitch,
          setPitch,
          brightness,
          setBrightness,
          cast,
          setCast,
          exposure,
          setExposure,
          noise,
          setNoise,
          hsv,
          setHsv,
          factor,
          setFactor,
          open,
          setOpen,
          close,
          setClose,
          filter,
          setFilter,
          inputSize,
          setInputSize,
          training,
          setTraining,
          hw,
          setHw,
          confidence,
          setConfidence,
          nmsIou,
          setNmsIou,
          rule,
          setRule,
        }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Readout
          label="Pieces in view"
          value={String(truth.length)}
        />
        <Readout
          label="Found"
          value={String(found.size)}
        />
        <Readout
          label="Missed"
          value={String(truth.length - found.size)}
        />
        <Readout
          label="False detections"
          value={String(falsePositives)}
        />
        <Readout
          label="Target distance"
          value={located ? fmt(located.distance, 3) : "—"}
          unit={located ? (targetTruth ? `m (true ${fmt(targetTruth.distance, 3)})` : "m (not a piece)") : undefined}
        />
        <Readout
          label="Processing time (rough)"
          value={fmt(ms, 2)}
          unit={`ms (${fmt(Math.min(1000 / ms, 999), 2)} fps)`}
        />
      </div>
      <p className="text-xs text-fd-muted-foreground">
        The image is 640×400, half the 1280×800, 70° camera used on the Vision pages, so the page stays fast. The scene
        is ray traced. The color pipeline is real: it runs on these pixels. The network is simulated: it does not run a
        trained model, but produces the kind of output one does, and gets worse with small, hidden, dark, or blown-out
        pieces the way real ones do. Processing times are rough figures for a single-board computer, for comparing
        settings only. There is no motion blur and no lens distortion.
      </p>
    </Widget>
  );
};

interface StageControlsProps {
  detector: Detector;
  stage: number;
  height: number;
  setHeight: (v: number) => void;
  pitch: number;
  setPitch: (v: number) => void;
  brightness: number;
  setBrightness: (v: number) => void;
  cast: number;
  setCast: (v: number) => void;
  exposure: number;
  setExposure: (v: number) => void;
  noise: number;
  setNoise: (v: number) => void;
  hsv: HsvRange;
  setHsv: (v: HsvRange) => void;
  factor: number;
  setFactor: (v: number) => void;
  open: number;
  setOpen: (v: number) => void;
  close: number;
  setClose: (v: number) => void;
  filter: BlobFilter;
  setFilter: (v: BlobFilter) => void;
  inputSize: number;
  setInputSize: (v: number) => void;
  training: "varied" | "single";
  setTraining: (v: "varied" | "single") => void;
  hw: Accelerator;
  setHw: (v: Accelerator) => void;
  confidence: number;
  setConfidence: (v: number) => void;
  nmsIou: number;
  setNmsIou: (v: number) => void;
  rule: TargetRule;
  setRule: (v: TargetRule) => void;
}

/** The settings for the selected stage. */
const StageControls = (p: StageControlsProps) => {
  const grid = "grid gap-4 sm:grid-cols-2";
  if (p.stage === 0)
    return (
      <div className={grid}>
        <Slider
          label="Camera height"
          value={p.height}
          min={0.25}
          max={1.2}
          step={0.05}
          format={(v) => `${fmt(v)} m`}
          onChange={p.setHeight}
        />
        <Slider
          label="Camera tilted down"
          value={p.pitch}
          min={-5}
          max={35}
          step={1}
          format={(v) => `${v}°`}
          onChange={p.setPitch}
        />
        <Slider
          label="Venue brightness"
          value={p.brightness}
          min={0.3}
          max={3}
          log
          format={(v) => `${fmt(v, 2)}×`}
          onChange={p.setBrightness}
        />
        <Slider
          label="Light color"
          value={p.cast}
          min={-1}
          max={1}
          step={0.05}
          format={(v) => (Math.abs(v) < 0.025 ? "neutral" : v > 0 ? `warm ${fmt(v, 2)}` : `cool ${fmt(-v, 2)}`)}
          onChange={p.setCast}
        />
        <Slider
          label="Camera exposure"
          value={p.exposure}
          min={0.25}
          max={4}
          log
          format={(v) => `${fmt(v, 2)}×`}
          onChange={p.setExposure}
        />
        <Slider
          label="Sensor noise"
          value={p.noise}
          min={0}
          max={20}
          step={1}
          format={(v) => `σ = ${v}`}
          onChange={p.setNoise}
        />
      </div>
    );

  if (p.detector === "color") {
    if (p.stage === 1)
      return (
        <div className={grid}>
          <Slider
            label="Hue low"
            value={p.hsv.hLo}
            min={0}
            max={179}
            step={1}
            format={(v) => `${v} (${v * 2}°)`}
            onChange={(v) => p.setHsv({ ...p.hsv, hLo: v })}
          />
          <Slider
            label="Hue high"
            value={p.hsv.hHi}
            min={0}
            max={179}
            step={1}
            format={(v) => `${v} (${v * 2}°)`}
            onChange={(v) => p.setHsv({ ...p.hsv, hHi: v })}
          />
          <Slider
            label="Saturation at least"
            value={p.hsv.sMin}
            min={0}
            max={255}
            step={1}
            onChange={(v) => p.setHsv({ ...p.hsv, sMin: v })}
          />
          <Slider
            label="Value (brightness) at least"
            value={p.hsv.vMin}
            min={0}
            max={255}
            step={1}
            onChange={(v) => p.setHsv({ ...p.hsv, vMin: v })}
          />
          <Segmented
            label="Processing resolution"
            value={String(p.factor)}
            onChange={(v) => p.setFactor(Number(v))}
            options={[
              { value: "1", label: "640×400" },
              { value: "2", label: "320×200" },
              { value: "4", label: "160×100" },
            ]}
          />
        </div>
      );
    if (p.stage === 2)
      return (
        <div className={grid}>
          <Slider
            label="Open (remove specks)"
            value={p.open}
            min={0}
            max={4}
            step={1}
            format={(v) => (v ? `${v} px` : "off")}
            onChange={p.setOpen}
          />
          <Slider
            label="Close (fill holes)"
            value={p.close}
            min={0}
            max={4}
            step={1}
            format={(v) => (v ? `${v} px` : "off")}
            onChange={p.setClose}
          />
        </div>
      );
    if (p.stage === 3)
      return (
        <div className={grid}>
          <Slider
            label="Smallest blob"
            value={p.filter.minAreaPct}
            min={0.001}
            max={1}
            log
            format={(v) => `${fmt(v, 2)}% of image`}
            onChange={(v) => p.setFilter({ ...p.filter, minAreaPct: v })}
          />
          <Slider
            label="Widest shape (width to height, either way)"
            value={p.filter.maxAspect}
            min={1}
            max={6}
            step={0.1}
            format={(v) => `${fmt(v, 2)} : 1`}
            onChange={(v) => p.setFilter({ ...p.filter, maxAspect: v })}
          />
          <Slider
            label="Fill at least (a ball fills 0.79 of its box)"
            value={p.filter.minFill}
            min={0}
            max={1}
            step={0.01}
            format={(v) => fmt(v, 2)}
            onChange={(v) => p.setFilter({ ...p.filter, minFill: v })}
          />
          <Segmented
            label="Reject blobs above the horizon"
            value={p.filter.belowHorizon ? "on" : "off"}
            onChange={(v) => p.setFilter({ ...p.filter, belowHorizon: v === "on" })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </div>
      );
  } else {
    if (p.stage === 1)
      return (
        <div className={grid}>
          <Segmented
            label="Model input size"
            value={String(p.inputSize)}
            onChange={(v) => p.setInputSize(Number(v))}
            options={[
              { value: "160", label: "160" },
              { value: "320", label: "320" },
              { value: "640", label: "640" },
            ]}
          />
          <Segmented
            label="Runs on"
            value={p.hw}
            onChange={p.setHw}
            options={[
              { value: "cpu", label: "CPU only" },
              { value: "npu", label: "Neural accelerator" },
            ]}
          />
        </div>
      );
    if (p.stage === 2)
      return (
        <div className={grid}>
          <Segmented
            label="Training images"
            value={p.training}
            onChange={p.setTraining}
            options={[
              { value: "varied", label: "Many venues" },
              { value: "single", label: "One venue" },
            ]}
          />
        </div>
      );
    if (p.stage === 3)
      return (
        <div className={grid}>
          <Slider
            label="Confidence threshold"
            value={p.confidence}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => fmt(v, 2)}
            onChange={p.setConfidence}
          />
          <Slider
            label="NMS overlap (IoU) threshold"
            value={p.nmsIou}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => fmt(v, 2)}
            onChange={p.setNmsIou}
          />
        </div>
      );
  }

  return (
    <div className={grid}>
      <Segmented
        label="Pick the target by"
        value={p.rule}
        onChange={p.setRule}
        options={[
          { value: "lowest", label: "Lowest in image" },
          { value: "largest", label: "Largest" },
          { value: "center", label: "Nearest center" },
          ...(p.detector === "ml" ? [{ value: "confident" as const, label: "Most confident" }] : []),
        ]}
      />
    </div>
  );
};
