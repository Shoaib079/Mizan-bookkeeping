/** Color theme preference — light / dark / system (follows OS). */

export const THEME_STORAGE_KEY = "mizan:theme";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Resolve whether the document should use the `.dark` class. */
export function resolveIsDark(
  mode: ThemeMode,
  prefersDark: boolean,
): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

export function readStoredThemeMode(
  getItem: (key: string) => string | null = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
): ThemeMode {
  const stored = getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

export function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function applyDocumentDarkClass(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/**
 * Inline bootstrap — runs before paint to avoid a light flash.
 * Keep in sync with resolveIsDark / readStoredThemeMode.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var mode=(s==="light"||s==="dark"||s==="system")?s:"system";var dark=mode==="dark"||(mode==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

type ThemeSnapshot = { mode: ThemeMode; dark: boolean };

type Listener = () => void;

let snapshot: ThemeSnapshot = { mode: "system", dark: false };
let hydrated = false;
const listeners = new Set<Listener>();
let mediaCleanup: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function bindSystemListener(enabled: boolean) {
  mediaCleanup?.();
  mediaCleanup = null;
  if (!enabled || typeof window === "undefined") return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (snapshot.mode !== "system") return;
    const dark = resolveIsDark("system", mq.matches);
    if (dark === snapshot.dark) return;
    snapshot = { mode: "system", dark };
    applyDocumentDarkClass(dark);
    emit();
  };
  mq.addEventListener("change", onChange);
  mediaCleanup = () => mq.removeEventListener("change", onChange);
}

function commit(mode: ThemeMode, prefersDark: boolean) {
  const dark = resolveIsDark(mode, prefersDark);
  snapshot = { mode, dark };
  applyDocumentDarkClass(dark);
  writeStoredThemeMode(mode);
  bindSystemListener(mode === "system");
  emit();
}

/** Load preference once (client). Safe to call repeatedly. */
export function hydrateThemePreference(): void {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  commit(readStoredThemeMode(), systemPrefersDark());
}

export function getThemeSnapshot(): ThemeSnapshot {
  return snapshot;
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  if (!hydrated) hydrateThemePreference();
  commit(mode, systemPrefersDark());
}

/** Test-only — clears module listeners/state between cases. */
export function resetThemePreferenceForTests(): void {
  mediaCleanup?.();
  mediaCleanup = null;
  listeners.clear();
  hydrated = false;
  snapshot = { mode: "system", dark: false };
}
