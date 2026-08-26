"use client";

/** Left rail — 2-column icon grid for Record desk v3. */

import { IconSquare } from "@/components/ui/icon-square";
import type { RecordDeskTile } from "@/components/record/record-desk-tiles";
import { cn } from "@/lib/utils";

type Props = {
  tiles: readonly RecordDeskTile[];
  activeId: string;
  onSelect: (id: RecordDeskTile["id"]) => void;
};

export function RecordDeskIconGrid({ tiles, activeId, onSelect }: Props) {
  return (
    <nav
      aria-label="Record type"
      data-testid="record-desk-icon-grid"
      className="grid w-full grid-cols-2 gap-2 lg:w-56 lg:shrink-0"
    >
      {tiles.map((tile) => {
        const active = tile.id === activeId;
        return (
          <button
            key={tile.id}
            type="button"
            data-testid={`record-desk-tile-${tile.id}`}
            aria-pressed={active}
            onClick={() => onSelect(tile.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-[var(--radius-card)] border px-2 py-3 text-center transition-colors",
              active
                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
            )}
          >
            <IconSquare
              icon={tile.icon}
              tint={tile.tint}
              stroke={tile.stroke}
              size="lg"
            />
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-primary" : "text-foreground",
              )}
            >
              {tile.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
