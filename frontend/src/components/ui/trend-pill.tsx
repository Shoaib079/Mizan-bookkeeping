"use client";

/** KPI trend indicator — e.g. "+12%" on StatCard. */

import { cn } from "@/lib/utils";

export function TrendPill({
  value,
  direction = "up",
  className,
}: {
  value: string;
  direction?: "up" | "down" | "flat";
  className?: string;
}) {
  return (
    <span
      data-trend-pill={direction}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        direction === "up" && "bg-[var(--trend-up-bg)] text-[var(--trend-up-fg)]",
        direction === "down" && "bg-[var(--trend-down-bg)] text-[var(--trend-down-fg)]",
        direction === "flat" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {value}
    </span>
  );
}
