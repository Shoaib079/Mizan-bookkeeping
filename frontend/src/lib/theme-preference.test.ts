/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  getThemeSnapshot,
  hydrateThemePreference,
  isThemeMode,
  readStoredThemeMode,
  resetThemePreferenceForTests,
  resolveIsDark,
  setThemeMode,
  subscribeTheme,
} from "@/lib/theme-preference";
import { sourceDeclaring } from "@/test-support/source";

afterEach(() => {
  resetThemePreferenceForTests();
  document.documentElement.classList.remove("dark");
});

describe("theme preference", () => {
  it("defaults to system when storage is empty or unknown", () => {
    expect(readStoredThemeMode(() => null)).toBe("system");
    expect(readStoredThemeMode(() => "nope")).toBe("system");
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("auto")).toBe(false);
  });

  it("resolves system from the OS preference", () => {
    expect(resolveIsDark("light", true)).toBe(false);
    expect(resolveIsDark("dark", false)).toBe(true);
    expect(resolveIsDark("system", true)).toBe(true);
    expect(resolveIsDark("system", false)).toBe(false);
  });

  it("bootstrap script treats missing storage as system and toggles .dark", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('"system"');
  });

  it("shares mode across subscribers", () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    stubMatchMedia(false);
    hydrateThemePreference();
    let ticks = 0;
    const unsub = subscribeTheme(() => {
      ticks += 1;
    });
    setThemeMode("dark");
    expect(getThemeSnapshot().mode).toBe("dark");
    expect(getThemeSnapshot().dark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    setThemeMode("light");
    expect(getThemeSnapshot().dark).toBe(false);
    expect(ticks).toBeGreaterThan(0);
    unsub();
  });
});

describe("ThemeModePicker / ThemeToggle", () => {
  it("exposes Light, Dark, and System and listens for OS changes", () => {
    const src = sourceDeclaring("ThemeModePicker");
    expect(src).toContain("THEME_MODES");
    expect(src).toContain('"Light"');
    expect(src).toContain('"Dark"');
    expect(src).toContain('"System"');
    expect(src).toContain("setThemeMode");
    expect(sourceDeclaring("ThemeToggle")).toContain("ThemeModePicker");
    expect(sourceDeclaring("hydrateThemePreference")).toContain(
      "bindSystemListener",
    );
  });
});

describe("dark mode tokens survive v2", () => {
  it("globals.css re-asserts dark surfaces under .dark[data-theme=v2]", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toContain('.dark[data-theme="v2"]');
    expect(css).toContain("--tint-mint: #1f3d2e");
    expect(css).toContain("--icon-green: #4ade80");
    expect(css).toContain("--accent-bar-blue: #60a5fa");
    const darkV2 = css.slice(css.indexOf('.dark[data-theme="v2"]'));
    expect(darkV2).toContain("--background: #0f172a");
    expect(darkV2).toContain("--card: #111c33");
  });

  it("layout boots theme before paint", () => {
    const layout = sourceDeclaring("RootLayout");
    expect(layout).toContain("THEME_BOOTSTRAP_SCRIPT");
  });
});

function stubLocalStorage(store: Record<string, string>) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    },
  });
}

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}
