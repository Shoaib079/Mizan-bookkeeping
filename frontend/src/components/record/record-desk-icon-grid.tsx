"use client";

/** Left rail — 3-column icon grid for Record desk v3. */

import { IconSquare } from "@/components/ui/icon-square";
import type { RecordDeskTile } from "@/components/record/record-desk-tiles";
import { cn } from "@/lib/utils";

type Props = {
  tiles: readonly RecordDeskTile[];
  activeId: string;
  onSelect: (id: RecordDeskTile["id"]) => void;
  /** Optional draft indicator on Count cash. */
  cashCountDraftPending?: boolean;
};

export function RecordDeskIconGrid({
  tiles,
  activeId,
  onSelect,
  cashCountDraftPending = false,
}: Props) {
  return (
    <nav
      aria-label="Record type"
      data-testid="record-desk-icon-grid"
      className="grid w-full grid-cols-3 gap-4 lg:w-56 lg:shrink-0"
    >
      {tiles.map((tile) => {
        const active = tile.id === activeId;
        const showDraft =
          tile.id === "countCash" && cashCountDraftPending;
        return (
          <button
            key={tile.id}
            type="button"
            data-testid={`record-desk-tile-${tile.id}`}
            aria-pressed={active}
            onClick={() => onSelect(tile.id)}
            className={cn(
              "relative flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border p-4 text-center transition-colors",
              active
                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
            )}
          >
            {showDraft && (
              <span
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
                aria-hidden
              />
            )}
            <IconSquare
              icon={tile.icon}
              tint={tile.tint}
              stroke={tile.stroke}
              size="xl"
            />
            <span
              className={cn(
                "text-xs font-medium leading-tight",
                active ? "text-primary" : "text-foreground",
              )}
            >
              {tile.label}
            </span>
            {showDraft && (
              <span className="sr-only"> — saved draft</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
