"use client";

/** Shared muted left accent bar for meaning cards (accepted-live). */

export const ACCENT_BAR = {
  green: "var(--accent-bar-green)",
  red: "var(--accent-bar-red)",
  amber: "var(--accent-bar-amber)",
  blue: "var(--accent-bar-blue)",
  gray: "var(--accent-bar-gray)",
} as const;

export type AccentBarTone = keyof typeof ACCENT_BAR;

/** Absolute bar — direct child of [data-meaning-card]. */
export function MeaningCardAccentBar() {
  return <span data-accent-bar aria-hidden />;
}
