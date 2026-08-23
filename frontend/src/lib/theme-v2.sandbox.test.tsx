// @vitest-environment jsdom

/** v2-only look — no toggle, no stored choice, no DEFAULT_THEME env. */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeRoot } from "@/components/layout/theme-root";
import { applyVisualTheme, THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("applyVisualTheme (always v2)", () => {
  it("sets data-theme=v2 on documentElement", () => {
    applyVisualTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      THEME_V2_ATTR,
    );
  });
});

describe("ThemeRoot", () => {
  it("always sets data-theme=v2", () => {
    render(<ThemeRoot />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");
  });
});

describe("v2-only wiring (source + mutations)", () => {
  it("layout bakes data-theme=v2 unconditionally", () => {
    const src = sourceDeclaring("RootLayout");
    expect(src).toContain('data-theme');
    expect(src).toContain("THEME_V2_ATTR");
    expect(src).toContain("ThemeRoot");
    expect(src).not.toContain("NEXT_PUBLIC_DEFAULT_THEME");
    expect(src).not.toContain("NEXT_PUBLIC_THEME_TOGGLE");
  });

  it("theme-v2 has no toggle / storage / env helpers", () => {
    const src = sourceAt("lib/theme-v2.ts");
    expect(src).toContain("applyVisualTheme");
    expect(src).not.toContain("VISUAL_THEME_STORAGE_KEY");
    expect(src).not.toContain("envDefaultTheme");
    expect(src).not.toContain("isThemeToggleEnabled");
    expect(src).not.toContain("resolveVisualTheme");
    expect(src).not.toContain("subscribeVisualTheme");
    expect(src).not.toContain("mizan:visual-theme");
  });

  it("mutation: New look toggle UI reappears → red", () => {
    const shell = sourceAt("components/layout/app-shell.tsx");
    expect(shell).not.toContain("NewLookToggle");
    expect(shell).not.toContain("new-look-toggle");
    expect(shell).not.toMatch(/New look/i);
  });

  it("mutation: data-theme absent or v1 → red", () => {
    const layout = sourceDeclaring("RootLayout");
    expect(layout).toMatch(/"data-theme":\s*THEME_V2_ATTR/);
    expect(layout).not.toMatch(/=== "v1"/);
    expect(layout).not.toMatch(/removeAttribute\(["']data-theme["']\)/);

    applyVisualTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("v2");
    expect(document.documentElement.getAttribute("data-theme")).not.toBe("v1");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(true);
  });
});
