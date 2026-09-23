import { CircleCheck, CircleX, Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import type { CSSProperties, ReactNode } from "react";

/** Callout kinds, including the aliases Fumadocs accepts (`warn`, `tip`). */
export type CalloutType = "info" | "note" | "warn" | "warning" | "error" | "success" | "tip" | "idea";

interface CalloutProps {
  type?: CalloutType;
  /** Heading next to the icon. Defaults to the kind's name, as GitHub does ("Note", "Warning", …). */
  title?: ReactNode;
  /** Replaces the default icon. */
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type Kind = "info" | "warning" | "error" | "success" | "idea";

const KINDS: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  info: { label: "Note", icon: Info, color: "var(--color-fd-info)" },
  warning: { label: "Warning", icon: TriangleAlert, color: "var(--color-fd-warning)" },
  error: { label: "Caution", icon: CircleX, color: "var(--color-fd-error)" },
  success: { label: "Success", icon: CircleCheck, color: "var(--color-fd-success)" },
  idea: { label: "Tip", icon: Lightbulb, color: "var(--color-fd-idea)" },
};

const resolve = (type: CalloutType): Kind => {
  if (type === "warn") return "warning";
  if (type === "note") return "info";
  if (type === "tip") return "idea";
  return type;
};

/**
 * GitHub-docs style callout: a thick colored bar on the left, with the kind's icon and title in the same color. Unlike
 * GitHub, the thin card border stays on the other three sides so the callout reads as a card.
 */
export const Callout = ({ type = "info", title, icon, children, className }: CalloutProps) => {
  const kind = KINDS[resolve(type)];
  const Icon = kind.icon;
  return (
    <div
      role="note"
      style={{ "--callout-color": kind.color } as CSSProperties}
      className={cn(
        "my-5 rounded-lg border border-l-4 border-fd-border border-l-(--callout-color) bg-fd-card px-4 py-3 text-sm",
        className
      )}>
      {/* Title text is nudged toward the foreground color so light hues like amber stay readable. */}
      <p className="my-0! flex items-center gap-2 font-semibold text-[color-mix(in_oklch,var(--callout-color)_75%,var(--color-fd-foreground))]">
        {icon ?? (
          <Icon
            className="size-4 shrink-0"
            aria-hidden
          />
        )}
        {title ?? kind.label}
      </p>
      {children && <div className="prose-no-margin mt-1.5 text-fd-foreground">{children}</div>}
    </div>
  );
};
