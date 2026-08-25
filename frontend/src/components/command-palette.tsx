"use client";

/** Global ⌘K data-first search — suppliers, customers, items, pages, actions (UX-B, audit A6). */

import { CommandPalettePanel } from "@/components/command-palette-panel";
import type { CommandPaletteProps } from "@/components/command-palette-types";
import { useCommandPalette } from "@/components/use-command-palette";

export function CommandPalette({ deliveryEnabled }: CommandPaletteProps) {
  const s = useCommandPalette(deliveryEnabled);

  if (!s.open) return null;

  return (
    <CommandPalettePanel
      panelRef={s.panelRef}
      inputRef={s.inputRef}
      listRef={s.listRef}
      query={s.query}
      onQueryChange={s.setQuery}
      rows={s.rows}
      activeIndex={s.activeIndex}
      onActiveIndexChange={s.setActiveIndex}
      onSelect={s.select}
      supplierSpend={s.supplierSpend}
      itemSpend={s.itemSpend}
    />
  );
}
