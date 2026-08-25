"use client";

import { RefObject } from "react";
import { Search } from "lucide-react";

import {
  RowIcon,
  rowBadge,
  rowKey,
  rowLabel,
} from "@/components/command-palette-row-helpers";
import type { PaletteRow } from "@/components/command-palette-types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  panelRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  rows: PaletteRow[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (index: number) => void;
  supplierSpend: Map<string, number>;
  itemSpend: Map<string, number>;
};

export function CommandPalettePanel({
  panelRef,
  inputRef,
  listRef,
  query,
  onQueryChange,
  rows,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  supplierSpend,
  itemSpend,
}: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[15vh]">
      <div
        ref={panelRef}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-pop)]"
        role="dialog"
        aria-modal
        aria-label="Search"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="border-0 shadow-none focus-visible:ring-0"
            placeholder="Search suppliers, customers, items, pages…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search suppliers, customers, items, pages"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto py-1"
          role="listbox"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            rows.map((row, index) => (
              <button
                key={rowKey(row, index)}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                  index === activeIndex && "bg-sidebar-accent text-primary",
                )}
                onMouseEnter={() => onActiveIndexChange(index)}
                onClick={() => onSelect(index)}
              >
                <RowIcon row={row} />
                <span className="min-w-0 flex-1 truncate">{rowLabel(row)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {rowBadge(row, supplierSpend, itemSpend)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
