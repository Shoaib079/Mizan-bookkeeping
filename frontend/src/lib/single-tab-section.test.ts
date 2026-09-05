/** Single-tab sections — no lone tab track; page title stays visible. */

import { describe, expect, it } from "vitest";

import { NAV_SECTIONS } from "@/lib/nav-sections-data";
import { sourceDeclaring } from "@/test-support/source";

describe("single-tab section chrome", () => {
  it("SectionTabs returns null when only one tab is visible", () => {
    const src = sourceDeclaring("SectionTabs");
    expect(src).toContain("if (tabs.length <= 1) return null");
  });

  it("suppliers is the one-tab section that used SectionShell", () => {
    const suppliers = NAV_SECTIONS.find((s) => s.id === "suppliers");
    expect(suppliers?.tabs).toHaveLength(1);
    expect(sourceDeclaring("ProcurementSectionLayout")).toContain(
      'sectionId="suppliers"',
    );
  });

  it("directory pages without multi-tab chrome keep a visible desktop title", () => {
    for (const { symbol, title } of [
      { symbol: "SuppliersPage", title: "Supplier directory" },
      { symbol: "StaffPage", title: "Team directory" },
      { symbol: "PartnersPage", title: "Partner directory" },
    ] as const) {
      const src = sourceDeclaring(symbol);
      expect(src, symbol).toContain(`title="${title}"`);
      expect(src, symbol).not.toContain("hideTitleOnDesktop");
    }
  });

  it("mutation: remove the single-tab early return → red", () => {
    const src = sourceDeclaring("SectionTabs");
    expect(src).toMatch(/if\s*\(\s*tabs\.length\s*<=\s*1\s*\)\s*return\s+null/);
  });
});
