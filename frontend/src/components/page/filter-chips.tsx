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
              // row of filters read as disabled labels rather than as choices
              // you could make. Tinted like the secondary buttons beside them;
              // the active one stays filled so it is still obvious which is on.
              active
                ? "border border-primary bg-primary/10 font-medium text-primary"
                : "border border-primary/40 text-primary hover:bg-primary/10",
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
