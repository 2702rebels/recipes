"use client";

import { Printer } from "lucide-react";

import { cn } from "@/lib/cn";

interface PrintButtonProps {
  /** `one` prints only the procedure this button sits in. `all` prints every procedure on the page, one per sheet. */
  scope: "one" | "all";
  className?: string;
}

/**
 * Prints tuning procedures as cards. Sets `data-print` on <html> (and `data-printing` on the chosen panel) for the
 * print styles in `app/global.css`, opens the print dialog, then clears the flags.
 */
export const PrintButton = ({ scope, className }: PrintButtonProps) => {
  const print = (event: React.MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    const panel = scope === "one" ? event.currentTarget.closest(".procedure") : null;
    root.dataset.print = scope;
    panel?.setAttribute("data-printing", "");
    const cleanup = () => {
      delete root.dataset.print;
      panel?.removeAttribute("data-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <button
      type="button"
      onClick={print}
      className={cn(
        "procedure-no-print inline-flex items-center gap-1.5 rounded-md border border-(--color-procedure-border) px-2 py-0.5 text-[11px] font-medium tracking-normal text-fd-muted-foreground normal-case transition-colors hover:text-fd-foreground",
        className
      )}>
      <Printer
        className="size-3.5"
        aria-hidden
      />
      {scope === "one" ? "Print" : "Print all procedures on this page"}
    </button>
  );
};

/** Page-level button for MDX: prints every tuning procedure on the page, one per sheet. */
export const PrintProcedures = () => (
  <div className="not-prose my-4 flex">
    <PrintButton scope="all" />
  </div>
);
