"use client";

/** One chip row for every filtered surface (DESIGN_ARCHETYPES §"shared pieces").
 *
 * Ledgers, review queues and list pages all filter; before this each wrote its
 * own pill markup with slightly different padding and active colours. */

import { cn } from "@/lib/utils";

export type FilterChip<T extends string> = {
  id: T;
  label: string;
  /** Optional count shown after the label (review queues). */
  count?: number;
};

export function FilterChips<T extends string>({
  chips,
  value,
  onChange,
  className,
  ariaLabel = "Filter",
}: {
  chips: FilterChip<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {chips.map((chip) => {
        const active = chip.id === value;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
              // The inactive chips were a grey border around grey text, so a
              // row of filters read as disabled labels rather than choices.
              // The chosen filter is filled; the others stay outlined. Unlike
              // the action buttons these are a set you pick from, so telling
              // the picked one apart is the whole job — filling all of them
              // would say nothing.
              active
                ? "bg-primary font-medium text-primary-foreground"
                : "border border-primary/40 text-primary hover:bg-primary/15",
            )}
            onClick={() => onChange(chip.id)}
          >
            {chip.label}
            {chip.count !== undefined && chip.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary/20" : "bg-muted",
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
