// @vitest-environment jsdom

/** v2 rollout — default theme + grace toggle. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewLookToggle } from "@/components/layout/new-look-toggle";
import { ThemeRoot } from "@/components/layout/theme-root";
import type { EntityRole } from "@/lib/settings-types";
import {
  VISUAL_THEME_STORAGE_KEY,
  applyVisualTheme,
  envDefaultTheme,
  isThemeToggleEnabled,
  resolveVisualThemeFrom,
  subscribeVisualTheme,
  THEME_V2_ATTR,
} from "@/lib/theme-v2";
import { sourceDeclaring } from "@/test-support/source";

const accessState: { role: EntityRole; membershipSettled: boolean } = {
  role: "owner",
  membershipSettled: true,
};

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    role: accessState.role,
    grants: [],
    membershipSettled: accessState.membershipSettled,
    loading: false,
    canWriteOperations: true,
    canWriteDailyTransactions: true,
    canReadFinancialReports: false,
    canReadReports: false,
    canAccessSettings: false,
    reload: vi.fn(),
  }),
}));

beforeEach(() => {
  accessState.role = "owner";
  accessState.membershipSettled = true;
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("env default theme helpers (v2 rollout)", () => {
  it("envDefaultTheme is v2 unless explicitly v1", () => {
    expect(envDefaultTheme(undefined)).toBe("v2");
    expect(envDefaultTheme("")).toBe("v2");
    expect(envDefaultTheme("v2")).toBe("v2");
    expect(envDefaultTheme("v1")).toBe("v1");
  });

  it("isThemeToggleEnabled unless explicitly false", () => {
    expect(isThemeToggleEnabled(undefined)).toBe(true);
    expect(isThemeToggleEnabled("")).toBe(true);
    expect(isThemeToggleEnabled("true")).toBe(true);
    expect(isThemeToggleEnabled("false")).toBe(false);
  });

  it("resolveVisualThemeFrom prefers stored value when toggle enabled", () => {
    expect(resolveVisualThemeFrom("v2", true, "v1")).toBe("v1");
    expect(resolveVisualThemeFrom("v1", true, "v2")).toBe("v2");
    expect(resolveVisualThemeFrom("v2", false, "v1")).toBe("v2");
    expect(resolveVisualThemeFrom("v1", false, "v2")).toBe("v1");
  });

  it("applyVisualTheme sets or clears data-theme on documentElement", () => {
    applyVisualTheme("v2");
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      THEME_V2_ATTR,
    );
    applyVisualTheme("v1");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applyVisualTheme notifies subscribeVisualTheme listeners", () => {
    const seen: string[] = [];
    const unsub = subscribeVisualTheme((t) => {
      seen.push(t);
    });
    applyVisualTheme("v2");
    applyVisualTheme("v1");
    unsub();
    applyVisualTheme("v2");
    expect(seen).toEqual(["v2", "v1"]);
  });
});

describe("ThemeRoot applies v2 default", () => {
  it("sets data-theme=v2 when env unset (production default)", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "");
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "");
    render(<ThemeRoot />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");
  });

  it("DEFAULT_THEME=v1 forces v1 (emergency)", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "v1");
    render(<ThemeRoot />);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("honours stored v1 when toggle enabled", () => {
    window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, "v1");
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "true");
    render(<ThemeRoot />);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("NewLookToggle (grace fallback)", () => {
  it("is hidden when NEXT_PUBLIC_THEME_TOGGLE=false", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "false");
    render(<NewLookToggle />);
    expect(screen.queryByRole("switch", { name: "New look" })).toBeNull();
  });

  it("flips to v1 and persists (grace); flips back to v2", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "true");
    render(<NewLookToggle />);
    const sw = screen.getByRole("switch", { name: "New look" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");

    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY)).toBe("v1");

    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");
    expect(window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY)).toBe("v2");
  });

  it("stays hidden for cashier even when toggle enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "true");
    accessState.role = "cashier";
    render(<NewLookToggle />);
    expect(screen.queryByRole("switch", { name: "New look" })).toBeNull();
  });
});

describe("root layout env wiring (source)", () => {
  it("layout bakes data-theme=v2 unless DEFAULT_THEME=v1", () => {
    const src = sourceDeclaring("RootLayout");
    expect(src).toContain("NEXT_PUBLIC_DEFAULT_THEME");
    expect(src).toContain('=== "v1"');
    expect(src).toContain("data-theme");
    expect(src).toContain("ThemeRoot");
    // Must not require THEME_TOGGLE to bake v2 (old sandbox gate).
    expect(src).not.toMatch(
      /THEME_TOGGLE[\s\S]*=== "true"[\s\S]*DEFAULT_THEME[\s\S]*=== "v2"/,
    );
  });

  it("mutation: default theme reverts to v1 → red", () => {
    const theme = sourceDeclaring("envDefaultTheme");
    const layout = sourceDeclaring("RootLayout");
    expect(theme).toContain('if (raw === "v1") return "v1"');
    expect(theme).toContain('return "v2"');
    expect(layout).toContain('NEXT_PUBLIC_DEFAULT_THEME === "v1"');
  });
});
