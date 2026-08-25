import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/**
 * Sample pages: each composes a single PageHeader H1 (or v2 greeting H1).
 * The shell must not also print the same title as a muted trail.
 */

const SAMPLE_PAGES: { label: string; source: () => string; titleHint: string }[] =
  [
    {
      label: "dashboard v1",
      source: () => sourceDeclaring("HomePage"),
      titleHint: "Dashboard",
    },
    {
      label: "record",
      source: () => sourceDeclaring("RecordPage"),
      titleHint: "Record",
    },
    {
      label: "sales",
      source: () => sourceDeclaring("SalesReviewPanel"),
      titleHint: "Sales activity",
    },
    {
      label: "expenses",
      source: () => sourceDeclaring("ExpensesReviewPanel"),
      titleHint: "Expenses",
    },
    {
      label: "suppliers",
      source: () => sourceDeclaring("SuppliersPage"),
      titleHint: "Supplier directory",
    },
    {
      label: "banking",
      source: () => sourceDeclaring("BankingHubContent"),
      titleHint: "Account overview",
    },
    {
      label: "reports",
      source: () => sourceDeclaring("ReportsPage"),
      titleHint: "Reports",
    },
    {
      label: "settings",
      source: () => sourceDeclaring("RestaurantSettingsContent"),
      titleHint: "Restaurant settings",
    },
  ];

describe("sample pages — single page title", () => {
  it.each(SAMPLE_PAGES)(
    "$label renders one PageHeader (or HubPage) title path, not a raw second h1",
    ({ source, titleHint }) => {
      const src = source();
      // No hand-rolled second <h1> beside the archetype header.
      expect(src.includes("<h1"), `${titleHint} draws a raw h1`).toBe(false);
      expect(
        src.includes("<PageHeader") ||
          src.includes("<HubPage") ||
          src.includes("<ListPage") ||
          src.includes("<OverviewPage") ||
          src.includes("<FormPage"),
        `${titleHint} missing title owner`,
      ).toBe(true);
    },
  );

  it("dashboard v2 greeting header stays a separate single-H1 pattern", () => {
    const header = sourceDeclaring("DashboardV2Header");
    expect(header).toContain("dashboard-v2-greeting");
    expect(header.match(/<h1/g)?.length).toBe(1);
    expect(header).not.toContain("page-eyebrow");
  });

  it("mobile top bar title + restaurant subtitle pattern unchanged", () => {
    const bar = sourceDeclaring("MobileTopBar");
    expect(bar).toContain("{title}");
    expect(bar).toContain("entityName");
    expect(bar).toContain('pathname === "/"');
  });
});
