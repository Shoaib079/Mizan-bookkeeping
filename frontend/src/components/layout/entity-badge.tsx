"use client";

/** Per-restaurant colour badge — Phase 12 Slice 12.0b. */

import { entityAccentColor, entityInitial } from "@/lib/entity-visual";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  name: string;
  className?: string;
  /** Compact mode for menu trigger overlay. */
  size?: "sm" | "md";
};

export function EntityBadge({ entityId, name, className, size = "md" }: Props) {
  const color = entityAccentColor(entityId);
  const initial = entityInitial(name);
  const compact = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 font-medium",
        compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        className,
      )}
      title={name}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
          compact ? "size-5 text-[10px]" : "size-6 text-xs",
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {initial}
      </span>
      <span className="max-w-[10rem] truncate">{name}</span>
    </span>
  );
}
