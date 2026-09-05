/** Shared tab-track chrome — section tabs, settings tabs, pickers.
 *
 * Same tokens as SegmentedControl so navigation and filters feel like one
 * family: muted track, filled active, thumb-sized hit area on phone.
 */

import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

/** Scrollable row (Banking / Review / …). */
export const TAB_TRACK_SCROLL = cn(
  "mb-4 flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap rounded-md border border-border p-1",
  "bg-[var(--segment-track-bg)]",
);

/** Wrapping row (Settings has more labels). */
export const TAB_TRACK_WRAP = cn(
  "mb-4 flex flex-wrap gap-1 rounded-md border border-border p-1",
  "bg-[var(--segment-track-bg)]",
);

export function tabTrackItemClass(active: boolean): string {
  return cn(
    "inline-flex h-9 min-w-[3rem] shrink-0 items-center justify-center gap-1.5 rounded px-3 text-sm transition-colors",
    MOBILE_TOUCH_TARGET,
    active
      ? "bg-[var(--segment-active-bg)] font-semibold text-[var(--segment-active-fg)] shadow-sm"
      : "font-medium text-[var(--segment-inactive-fg)] hover:bg-background/60 hover:text-foreground",
  );
}
