import { describe, expect, it } from "vitest";

import {
  filterRevenueAccounts,
  formatChartAccountLabel,
} from "@/lib/chart-accounts";

describe("formatChartAccountLabel", () => {
  it("uses name_en when present", () => {
    expect(
      formatChartAccountLabel({ code: "4000", name_en: "Sales revenue" }),
    ).toBe("4000 — Sales revenue");
  });

  it("falls back to name_tr then name", () => {
    expect(formatChartAccountLabel({ code: "4100", name_tr: "Diğer gelir" })).toBe(
      "4100 — Diğer gelir",
    );
    expect(formatChartAccountLabel({ code: "4200", name: "Legacy" })).toBe(
      "4200 — Legacy",
    );
  });

  it("falls back to code when no name fields", () => {
    expect(formatChartAccountLabel({ code: "4300" })).toBe("4300 — 4300");
  });
});

describe("filterRevenueAccounts", () => {
  it("keeps 4xxx revenue codes", () => {
    const items = [
      { code: "1200", name_en: "AR" },
      { code: "4000", name_en: "Sales" },
      { code: "4100", name_en: "Other" },
      { code: "5000", name_en: "COGS" },
    ];
    expect(filterRevenueAccounts(items).map((a) => a.code)).toEqual([
      "4000",
      "4100",
    ]);
  });
});
