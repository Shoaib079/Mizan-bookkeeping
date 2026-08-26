"use client";

/** One row of mutually exclusive options — Buy/Sell/Spend, currency wallets.
 *
 * Extracted because the FX dialog hand-rolled this twice in one file, and both
 * copies marked the chosen option with `bg-background`: white on a grey track,
 * so the selection carried no colour and read as an unselected pill that
 * happened to be lighter. Hand-rolling it a third time would have produced a
 * third colourless control.
 *
 * Options are passed as data, so a wallet or currency added later inherits the
 * styling without anyone remembering to give it any.
 */

import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  /** `tablist` when the row switches panels, `group` when it filters. */
  role = "group",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  role?: "group" | "tablist";
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap gap-1 rounded-md border border-border p-1",
        "bg-[var(--segment-track-bg)]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={role === "tablist" ? "tab" : undefined}
            aria-selected={role === "tablist" ? active : undefined}
            aria-pressed={role === "group" ? active : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 min-w-[3rem] flex-1 items-center justify-center rounded px-3 text-sm transition-colors",
              MOBILE_TOUCH_TARGET,
              active
                ? "bg-[var(--segment-active-bg)] font-semibold text-[var(--segment-active-fg)] shadow-sm"
                : "font-medium text-[var(--segment-inactive-fg)] hover:bg-background/60 hover:text-foreground",
            )}
            data-segment-active={active ? "true" : "false"}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
