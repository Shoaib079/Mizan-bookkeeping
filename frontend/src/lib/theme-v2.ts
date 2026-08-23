/** Visual theme — v2 is the only look (owner 2026-08-24).
 *
 * `<html data-theme="v2">` is always on. No toggle, no stored choice, no
 * DEFAULT_THEME / THEME_TOGGLE env. Preview gallery still uses `themeV2Props()`.
 */

export const THEME_V2_ATTR = "v2" as const;

export type ThemeV2Scope = typeof THEME_V2_ATTR;

/**
 * Accepted shared chrome (owner 2026-08-22) — left bar + IconSquare.
 */
export const ACCEPTED_LIVE_CHROME = [
  "MeaningCardAccentBar / [data-accent-bar]",
  "IconSquare / [data-icon-square]",
] as const;

/** Wrap preview gallery content under a local data-theme scope. */
export function themeV2Props(): { "data-theme": ThemeV2Scope } {
  return { "data-theme": THEME_V2_ATTR };
}

/** Ensure `data-theme="v2"` on `<html>` (client hydrate / ThemeRoot). */
export function applyVisualTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", THEME_V2_ATTR);
}
