import { ArrowDown, ArrowRight, ListChecks } from "lucide-react";
import Link from "next/link";

import {
  findMechanism,
  GENERAL_PROCEDURES,
  MECHANISM_PROCEDURES,
  MODE_LABEL,
  type ProcedureMode,
} from "@/lib/procedures";

import { PrintButton } from "./procedure-print";

import type { ReactNode } from "react";

interface ProcedureProps {
  /** Label in the panel header. */
  title?: string;
  /** Mechanism or topic the procedure applies to, shown as a badge. */
  mechanism?: string;
  /** Output family. Sets the panel color (voltage teal, torque-current violet) and adds a badge. */
  mode?: ProcedureMode;
  children: ReactNode;
}

const Badge = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border border-(--color-procedure-border) bg-fd-background/60 px-2 py-0.5 text-[11px] font-medium tracking-normal text-fd-foreground normal-case">
    {children}
  </span>
);

/**
 * Panel that sets a tuning procedure apart from the surrounding text: a tinted background and border colored by output
 * family, a header naming the mechanism and output family, a print button, and numbered step markers (see
 * `.procedure` in `app/global.css`). Wrap only the procedure body. Keep the section heading outside so anchors and the
 * page outline are unchanged.
 */
export const Procedure = ({ title = "Tuning procedure", mechanism, mode, children }: ProcedureProps) => (
  <section
    data-mode={mode ?? "general"}
    className="procedure my-6 rounded-xl border px-4 pt-3 pb-1 sm:px-5">
    <header className="not-prose mb-3 flex flex-wrap items-center gap-2 border-b border-(--color-procedure-border) pb-2.5 text-xs font-semibold tracking-wide text-(--color-procedure) uppercase">
      <ListChecks
        className="size-4"
        aria-hidden
      />
      {title}
      {mechanism && <Badge>{mechanism}</Badge>}
      {mode && <Badge>{MODE_LABEL[mode]}</Badge>}
      <PrintButton
        scope="one"
        className="ms-auto"
      />
    </header>
    {children}
  </section>
);

/** A link styled as a pill in the color of one output family (or the general color). */
const ModeLink = ({ href, mode, children }: { href: string; mode?: ProcedureMode; children: ReactNode }) => (
  <Link
    href={href}
    data-mode={mode ?? "general"}
    className="procedure-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium no-underline transition-colors">
    {children}
  </Link>
);

interface ProcedureLinksProps {
  /** Mechanism name as listed in `lib/procedures.ts`. */
  mechanism: string;
  /** Output family of the page this row is on. */
  mode: ProcedureMode;
}

/**
 * Row of links under a mechanism heading: jump down to this page's tuning procedure, or over to the same mechanism's
 * procedure in the other output family.
 */
export const ProcedureLinks = ({ mechanism, mode }: ProcedureLinksProps) => {
  const entry = findMechanism(mechanism);
  if (!entry) return null;
  const other: ProcedureMode = mode === "voltage" ? "torque" : "voltage";
  return (
    <nav
      aria-label={`${mechanism} tuning procedures`}
      className="procedure-no-print not-prose my-4 flex flex-wrap gap-2">
      <ModeLink
        href={entry[mode]}
        mode={mode}>
        <ArrowDown
          className="size-3.5"
          aria-hidden
        />
        Jump to the tuning procedure
      </ModeLink>
      <ModeLink
        href={entry[other]}
        mode={other}>
        {MODE_LABEL[other]} version
        <ArrowRight
          className="size-3.5"
          aria-hidden
        />
      </ModeLink>
    </nav>
  );
};

/** Table of every tuning procedure, by mechanism and output family, plus the general procedures. */
export const ProcedureIndex = () => (
  <div className="not-prose my-6 flex flex-col gap-6">
    <div className="overflow-x-auto rounded-xl border border-fd-border">
      <table className="w-full text-sm">
        <thead className="bg-fd-muted/50 text-left text-xs text-fd-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Mechanism</th>
            <th className="px-4 py-2.5 font-medium">{MODE_LABEL.voltage}</th>
            <th className="px-4 py-2.5 font-medium">{MODE_LABEL.torque}</th>
          </tr>
        </thead>
        <tbody>
          {MECHANISM_PROCEDURES.map((p) => (
            <tr
              key={p.mechanism}
              className="border-t border-fd-border">
              <td className="px-4 py-3 font-medium">{p.mechanism}</td>
              <td className="px-4 py-3">
                <ModeLink
                  href={p.voltage}
                  mode="voltage">
                  Voltage procedure
                  <ArrowRight
                    className="size-3.5"
                    aria-hidden
                  />
                </ModeLink>
              </td>
              <td className="px-4 py-3">
                <ModeLink
                  href={p.torque}
                  mode="torque">
                  Torque-current procedure
                  <ArrowRight
                    className="size-3.5"
                    aria-hidden
                  />
                </ModeLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      {GENERAL_PROCEDURES.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          data-mode={p.mode ?? "general"}
          className="procedure-card flex flex-col gap-1.5 rounded-xl border p-4 no-underline transition-colors">
          <span className="flex items-center gap-2 text-sm font-semibold text-(--color-procedure)">
            <ListChecks
              className="size-4"
              aria-hidden
            />
            {p.title}
          </span>
          <span className="text-sm text-fd-muted-foreground">{p.description}</span>
          {p.mode && <span className="text-xs font-medium text-(--color-procedure)">{MODE_LABEL[p.mode]}</span>}
        </Link>
      ))}
    </div>
  </div>
);
