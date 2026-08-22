/** Mobile visual refresh v2 — preview-only theme scope (DESIGN_SYSTEM §8). */

export const THEME_V2_ATTR = "v2" as const;

export type ThemeV2Scope = typeof THEME_V2_ATTR;

/** Wrap preview gallery content; live app never sets this on <html>. */
export function themeV2Props(): { "data-theme": ThemeV2Scope } {
  return { "data-theme": THEME_V2_ATTR };
}
