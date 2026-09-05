/** Layout helpers for DateInput calendar popover (desktop + mobile portal). */

import type { CSSProperties } from "react";

import { isFutureDay, parseDisplayToDate } from "@/lib/dates";

export const CALENDAR_WIDTH_PX = 280;
export const CALENDAR_HEIGHT_EST_PX = 340;
export const VIEWPORT_PAD_PX = 8;
/** Gap between the field bottom and the calendar top. */
export const CALENDAR_BELOW_GAP_PX = 4;
/** Keep the popover usable when the field sits near the bottom edge. */
export const CALENDAR_MIN_HEIGHT_PX = 220;

export function viewFromValue(
  value: string,
  today: Date | null,
  disableFuture: boolean,
): { year: number; month: number } | null {
  const parsed = parseDisplayToDate(value);
  if (parsed) {
    if (disableFuture && today && isFutureDay(parsed, today)) {
      return { year: today.getFullYear(), month: today.getMonth() };
    }
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
  }
  if (today) {
    return { year: today.getFullYear(), month: today.getMonth() };
  }
  return null;
}

/**
 * Anchor the mobile calendar **below** the field (modern pick-date UX).
 * If space below is tight, shrink with maxHeight + scroll — do not flip above.
 */
export function computeMobileCalendarStyle(anchor: DOMRect): CSSProperties {
  const width = Math.min(
    CALENDAR_WIDTH_PX,
    window.innerWidth - VIEWPORT_PAD_PX * 2,
  );
  let left = anchor.left;
  left = Math.max(
    VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD_PX),
  );

  const top = anchor.bottom + CALENDAR_BELOW_GAP_PX;
  const spaceBelow = window.innerHeight - VIEWPORT_PAD_PX - top;
  const maxHeight = Math.max(
    Math.min(CALENDAR_HEIGHT_EST_PX, spaceBelow),
    Math.min(CALENDAR_MIN_HEIGHT_PX, spaceBelow),
  );

  return {
    position: "fixed",
    left,
    top,
    width,
    zIndex: 60,
    maxHeight,
    overflowY: "auto",
  };
}
