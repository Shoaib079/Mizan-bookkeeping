/** Single-tab sections — no lone tab track; page title stays visible. */

import { describe, expect, it } from "vitest";

import { NAV_SECTIONS } from "@/lib/nav-sections-data";
import { sourceDeclaring } from "@/test-support/source";

describe("single-tab section chrome", () => {
  it("SectionTabs returns null when only one tab is visible", () => {
    const src = sourceDeclaring("SectionTabs");
    expect(src).toContain("if (tabs.length <= 1) return null");
  });

  it("suppliers and banking are one-tab sections (no tab track)", () => {
    const suppliers = NAV_SECTIONS.find((s) => s.id === "suppliers");
    expect(suppliers?.tabs).toHaveLength(1);
    expect(sourceDeclaring("ProcurementSectionLayout")).toContain(
      'sectionId="suppliers"',
    );

    const banking = NAV_SECTIONS.find((s) => s.id === "banking");
    expect(banking?.tabs).toHaveLength(1);
    expect(banking?.tabs[0]?.href).toBe("/banking");
    expect(banking?.tabs.some((t) => t.href === "/banking/cash")).toBe(false);
    expect(banking?.tabs.some((t) => t.href === "/banking/transfers")).toBe(
      false,
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
