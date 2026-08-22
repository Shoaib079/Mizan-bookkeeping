// @vitest-environment jsdom

/** Sandbox-wide v2 theme — env default + optional owner toggle. */

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
  THEME_V2_ATTR,
} from "@/lib/theme-v2";

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

describe("env default theme helpers", () => {
  it("envDefaultTheme is v2 when NEXT_PUBLIC_DEFAULT_THEME=v2", () => {
    expect(envDefaultTheme("v2")).toBe("v2");
    expect(envDefaultTheme(undefined)).toBe("v1");
    expect(envDefaultTheme("")).toBe("v1");
  });

  it("isThemeToggleEnabled only when exactly true", () => {
    expect(isThemeToggleEnabled("true")).toBe(true);
    expect(isThemeToggleEnabled(undefined)).toBe(false);
    expect(isThemeToggleEnabled("1")).toBe(false);
  });

  it("resolveVisualThemeFrom prefers stored value when toggle enabled", () => {
    expect(resolveVisualThemeFrom("v2", true, "v1")).toBe("v1");
    expect(resolveVisualThemeFrom("v1", true, "v2")).toBe("v2");
    expect(resolveVisualThemeFrom("v2", false, "v1")).toBe("v2");
    expect(resolveVisualThemeFrom("v1", false, "v2")).toBe("v1");
  });

  it("applyVisualTheme sets or clears data-theme on documentElement", () => {
    applyVisualTheme("v2");
    expect(document.documentElement.getAttribute("data-theme")).toBe(THEME_V2_ATTR);
    applyVisualTheme("v1");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("ThemeRoot applies env default", () => {
  it("sets data-theme=v2 when env says v2", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "v2");
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "");
    render(<ThemeRoot />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");
  });

  it("leaves no data-theme attribute when env is unset (v1)", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "");
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "");
    document.documentElement.setAttribute("data-theme", "v2");
    render(<ThemeRoot />);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("NewLookToggle", () => {
  it("is hidden when NEXT_PUBLIC_THEME_TOGGLE is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "v2");
    render(<NewLookToggle />);
    expect(screen.queryByRole("switch", { name: "New look" })).toBeNull();
  });

  it("flips the attribute and persists when toggle env is on", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_THEME", "v2");
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

  it("stays hidden for cashier even when toggle env is on", () => {
    vi.stubEnv("NEXT_PUBLIC_THEME_TOGGLE", "true");
    accessState.role = "cashier";
    render(<NewLookToggle />);
    expect(screen.queryByRole("switch", { name: "New look" })).toBeNull();
  });
});

describe("root layout env wiring (source)", () => {
  it("layout sets data-theme from NEXT_PUBLIC_DEFAULT_THEME", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    expect(src).toContain("NEXT_PUBLIC_DEFAULT_THEME");
    expect(src).toContain("data-theme");
    expect(src).toContain("ThemeRoot");
  });
});
