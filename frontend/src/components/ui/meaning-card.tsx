"use client";

/** Shared muted left accent bar for meaning cards.
 *
 * Accepted-live (owner 2026-08-22): bar paints on v1 and v2 alike.
 * Non-accepted v2-only chrome mounts via ThemeV2OnlyMarker (gated).
 */

import { ThemeV2OnlyMarker } from "@/components/ui/theme-v2-gate";

export const ACCENT_BAR = {
  green: "var(--accent-bar-green, #4E9E77)",
  red: "var(--accent-bar-red, #C05B62)",
  amber: "var(--accent-bar-amber, #BE8A3F)",
  blue: "var(--accent-bar-blue, #4C7FC4)",
  gray: "var(--accent-bar-gray, #A7B0BD)",
} as const;

export type AccentBarTone = keyof typeof ACCENT_BAR;

/** Absolute bar + v2-only sentinel — direct children of [data-meaning-card]. */
export function MeaningCardAccentBar() {
  return (
    <>
      <span data-accent-bar aria-hidden />
      <ThemeV2OnlyMarker />
    </>
  );
}
