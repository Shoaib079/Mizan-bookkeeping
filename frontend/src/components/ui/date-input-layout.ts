/** Layout helpers for DateInput calendar popover (desktop + mobile portal). */

import type { CSSProperties } from "react";

import { isFutureDay, parseDisplayToDate } from "@/lib/dates";

export const CALENDAR_WIDTH_PX = 280;
export const CALENDAR_HEIGHT_EST_PX = 340;
export const VIEWPORT_PAD_PX = 8;

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

  let top = anchor.bottom + 4;
  if (top + CALENDAR_HEIGHT_EST_PX > window.innerHeight - VIEWPORT_PAD_PX) {
    const above = anchor.top - CALENDAR_HEIGHT_EST_PX - 4;
    if (above >= VIEWPORT_PAD_PX) {
      top = above;
    } else {
      top = Math.max(
        VIEWPORT_PAD_PX,
        window.innerHeight - CALENDAR_HEIGHT_EST_PX - VIEWPORT_PAD_PX,
      );
    }
  }

  return { position: "fixed", left, top, width, zIndex: 60 };
}
