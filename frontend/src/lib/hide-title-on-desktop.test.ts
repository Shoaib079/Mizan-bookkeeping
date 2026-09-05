/** Desktop: section tabs already name the page — hide the redundant H1. */

import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("hideTitleOnDesktop — section list doubles", () => {
  it("PageHeader supports hideTitleOnDesktop (sr-only on desktop)", () => {
    const header = sourceDeclaring("PageHeader");
    expect(header).toContain("hideTitleOnDesktop");
    expect(header).toContain('data-hide-title-desktop={hideTitleOnDesktop ? "true"');
    expect(header).toMatch(
      /hideTitleOnDesktop \? "sr-only" : "max-\[819px\]:sr-only"/,
    );
  });

  it("ListPage and HubPage pass the flag through", () => {
    expect(sourceDeclaring("ListPage")).toContain("hideTitleOnDesktop");
    expect(sourceDeclaring("HubPage")).toContain("hideTitleOnDesktop");
  });

  it("directory / catalogue / section list pages opt in", () => {
    const cases: { label: string; src: string; needle: string }[] = [
      {
        label: "CustomersPage",
        src: sourceDeclaring("CustomersPage"),
        needle: 'title="Customer directory"',
      },
      {
        label: "GroupMenusPanel",
        src: sourceDeclaring("GroupMenusPanel"),
        needle: 'title="Menu catalogue"',
      },
      {
        label: "BankingHubContent",
        src: sourceDeclaring("BankingHubContent"),
        needle: 'title="Account overview"',
      },
      {
        label: "SalesReviewPanel",
        src: sourceDeclaring("SalesReviewPanel"),
        needle: 'title = "Sales activity"',
      },
      {
        label: "statement-review-panel",
        src: sourceAt("components/review/statement-review-panel.tsx"),
        needle: 'title="Bank lines to review"',
      },
    ];
    for (const { label, src, needle } of cases) {
      expect(src, label).toContain(needle);
      expect(src, label).toContain("hideTitleOnDesktop");
    }
  });

  it("mutation: customers list without hideTitleOnDesktop → red", () => {
    const src = sourceDeclaring("CustomersPage");
    const idx = src.indexOf('title="Customer directory"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 80)).toContain("hideTitleOnDesktop");
  });
});
