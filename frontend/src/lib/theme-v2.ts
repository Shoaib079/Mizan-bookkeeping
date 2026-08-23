/** Mobile visual refresh v2 — token scope (DESIGN_SYSTEM §8).
 *
 * Preview gallery wraps content with `themeV2Props()`. Sandbox may set
 * `data-theme="v2"` on `<html>` only when BOTH `NEXT_PUBLIC_DEFAULT_THEME=v2`
 * AND `NEXT_PUBLIC_THEME_TOGGLE=true` (owner A/B). Production leaves both
 * unset. Accepted-live chrome (left accent bar + IconSquare) is intentional
 * v1 baseline — see DECISIONS 2026-08-22.
 */

export const THEME_V2_ATTR = "v2" as const;

/** Marks chrome that must only exist under data-theme=v2 (not accepted-live). */
export const THEME_V2_ONLY_ATTR = "data-theme-v2-only" as const;

export type ThemeV2Scope = typeof THEME_V2_ATTR;

export type AppVisualTheme = "v1" | "v2";

/** localStorage key for the sandbox A/B switch (not used when toggle env is off). */
export const VISUAL_THEME_STORAGE_KEY = "mizan:visual-theme";

/**
 * Accepted on live (owner 2026-08-22) — intentional v1+v2 shared baseline.
 * Do not gate these behind data-theme=v2.
 */
export const ACCEPTED_LIVE_CHROME = [
  "MeaningCardAccentBar / [data-accent-bar]",
  "IconSquare / [data-icon-square]",
] as const;

/** Wrap preview gallery content under a local data-theme scope. */
export function themeV2Props(): { "data-theme": ThemeV2Scope } {
  return { "data-theme": THEME_V2_ATTR };
}

/**
 * Env default is v2 only in sandbox: DEFAULT_THEME=v2 alone must NOT flip
 * production. Requires THEME_TOGGLE=true as well.
 */
export function envDefaultTheme(
  raw: string | undefined = process.env.NEXT_PUBLIC_DEFAULT_THEME,
  toggleRaw: string | undefined = process.env.NEXT_PUBLIC_THEME_TOGGLE,
): AppVisualTheme {
  if (raw === "v2" && isThemeToggleEnabled(toggleRaw)) return "v2";
  return "v1";
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
type VisualThemeListener = (theme: AppVisualTheme) => void;
const visualThemeListeners = new Set<VisualThemeListener>();

/** Subscribe to theme changes applied via `applyVisualTheme` (shared across hooks). */
export function subscribeVisualTheme(
  listener: VisualThemeListener,
): () => void {
  visualThemeListeners.add(listener);
  return () => {
    visualThemeListeners.delete(listener);
  };
}

export function applyVisualTheme(theme: AppVisualTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "v2") {
    document.documentElement.setAttribute("data-theme", THEME_V2_ATTR);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  for (const listener of visualThemeListeners) {
    listener(theme);
  }
}
