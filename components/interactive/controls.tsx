"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { Commutation, MotorId } from "@/lib/motors";

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Map the slider logarithmically, for values spanning several decades. */
  log?: boolean;
  /** Formats the current value for display next to the label. */
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

/** Labeled range input with an optional logarithmic scale. */
export const Slider = ({ label, value, min, max, step, log, format = String, onChange }: SliderProps) => {
  const id = useId();
  const toPos = (v: number) => (log ? Math.log10(v) : v);
  const fromPos = (p: number) => (log ? 10 ** p : p);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label
          htmlFor={id}
          className="font-medium">
          {label}
        </label>
        <span className="font-mono text-xs text-fd-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={toPos(min)}
        max={toPos(max)}
        step={log ? (toPos(max) - toPos(min)) / 200 : step}
        value={toPos(value)}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
        className="w-full accent-fd-primary"
      />
    </div>
  );
};

interface SegmentedProps<T extends string> {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

/** A small group of mutually exclusive buttons. */
export const Segmented = <T extends string>({ label, value, options, onChange }: SegmentedProps<T>) => (
  <div className="flex flex-col gap-1">
    <span className="text-sm font-medium">{label}</span>
    <div
      role="radiogroup"
      className="inline-flex w-fit rounded-lg border border-fd-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            o.value === value
              ? "bg-fd-primary text-fd-primary-foreground"
              : "text-fd-muted-foreground hover:text-fd-foreground"
          )}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

interface ReadoutProps {
  label: ReactNode;
  value: string;
  unit?: string;
  /** Highlight values the reader should copy into their config. */
  emphasis?: boolean;
}

/** A labeled computed value. */
export const Readout = ({ label, value, unit, emphasis }: ReadoutProps) => (
  <div
    className={cn(
      "flex flex-col rounded-lg border px-3 py-2",
      emphasis ? "border-fd-primary/40 bg-fd-primary/5" : "border-fd-border"
    )}>
    <span className="text-xs text-fd-muted-foreground">{label}</span>
    <span className="font-mono text-base tabular-nums">
      {value}
      {unit && <span className="ml-1 text-xs text-fd-muted-foreground">{unit}</span>}
    </span>
  </div>
);

/** Card frame shared by all interactive widgets. */
export const Widget = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="not-prose my-6 flex flex-col gap-5 rounded-xl border border-fd-border bg-fd-card p-4 text-fd-card-foreground sm:p-5">
    <div className="text-sm font-semibold tracking-wide text-fd-muted-foreground uppercase">{title}</div>
    {children}
  </div>
);

interface MotorPickerProps {
  motor: MotorId;
  commutation: Commutation;
  onMotorChange: (v: MotorId) => void;
  onCommutationChange: (v: Commutation) => void;
}

/** Motor and commutation selectors shared by widgets that use {@link MOTORS}. */
export const MotorPicker = ({ motor, commutation, onMotorChange, onCommutationChange }: MotorPickerProps) => (
  <>
    <Segmented
      label="Motor"
      value={motor}
      onChange={onMotorChange}
      options={[
        { value: "x60", label: "Kraken X60" },
        { value: "x44", label: "Kraken X44" },
      ]}
    />
    <Segmented
      label="Commutation"
      value={commutation}
      onChange={onCommutationChange}
      options={[
        { value: "foc", label: "FOC" },
        { value: "trap", label: "Trapezoidal" },
      ]}
    />
  </>
);

/** Formats a number to a few significant digits, or an em dash if it isn't finite. */
export const fmt = (v: number, digits = 3) => (Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : "—");

interface ActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  /** Filled style for the main action. */
  primary?: boolean;
  disabled?: boolean;
}

/** Button used for actions inside widgets. */
export const ActionButton = ({ children, onClick, primary, disabled }: ActionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
      primary
        ? "bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90"
        : "border border-fd-border hover:bg-fd-accent"
    )}>
    {children}
  </button>
);
