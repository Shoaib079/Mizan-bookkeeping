/** Mobile visual refresh v2 — token scope (DESIGN_SYSTEM §8).
 *
 * Preview gallery wraps content with `themeV2Props()`. The live app may set
 * `data-theme="v2"` on `<html>` when `NEXT_PUBLIC_DEFAULT_THEME=v2` (sandbox);
 * production leaves that unset so v1 tokens stay the default.
 */

export const THEME_V2_ATTR = "v2" as const;

export type ThemeV2Scope = typeof THEME_V2_ATTR;

export type AppVisualTheme = "v1" | "v2";

/** localStorage key for the sandbox A/B switch (not used when toggle env is off). */
export const VISUAL_THEME_STORAGE_KEY = "mizan:visual-theme";

/** Wrap preview gallery content under a local data-theme scope. */
export function themeV2Props(): { "data-theme": ThemeV2Scope } {
  return { "data-theme": THEME_V2_ATTR };
}

export function envDefaultTheme(
  raw: string | undefined = process.env.NEXT_PUBLIC_DEFAULT_THEME,
): AppVisualTheme {
  return raw === "v2" ? "v2" : "v1";
}

export function isThemeToggleEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_THEME_TOGGLE,
): boolean {
  return raw === "true";
}

export function resolveVisualThemeFrom(
  envDefault: AppVisualTheme,
  toggleEnabled: boolean,
  stored: AppVisualTheme | null,
): AppVisualTheme {
  if (toggleEnabled && (stored === "v1" || stored === "v2")) return stored;
  return envDefault;
}

export function resolveVisualTheme(): AppVisualTheme {
  return resolveVisualThemeFrom(
    envDefaultTheme(),
    isThemeToggleEnabled(),
    readStoredVisualTheme(),
  );
}

export function readStoredVisualTheme(): AppVisualTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY);
    if (value === "v1" || value === "v2") return value;
  } catch {
    // ignore quota / private mode
  }
  return null;
}

export function writeStoredVisualTheme(theme: AppVisualTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

/** Apply or clear `data-theme="v2"` on `<html>`. */
export function applyVisualTheme(theme: AppVisualTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "v2") {
    document.documentElement.setAttribute("data-theme", THEME_V2_ATTR);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
