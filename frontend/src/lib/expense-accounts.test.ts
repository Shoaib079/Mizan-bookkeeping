import { describe, expect, it } from "vitest";

import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  type ChartAccount,
} from "@/lib/expense-accounts";

const SAMPLE: ChartAccount[] = [
  { id: "1", code: "1000", name: "Cash", account_type: "asset" },
  { id: "2", code: "5200", name: "General Expense", account_type: "expense" },
  { id: "3", code: "5100", name: "Salaries & Wages", account_type: "expense" },
  { id: "5", code: "5210", name: "Utilities", account_type: "expense" },
  { id: "6", code: "5220", name: "Supplies & Ingredients", account_type: "expense" },
  { id: "4", code: "4000", name: "Sales Revenue", account_type: "revenue" },
];

describe("filterExpenseAccounts", () => {
  it("returns only expense-type accounts", () => {
    expect(filterExpenseAccounts(SAMPLE).map((a) => a.code)).toEqual([
      "5200",
      "5100",
      "5210",
      "5220",
    ]);
  });

  it("excludes retired 5700 when absent from chart", () => {
    expect(filterExpenseAccounts(SAMPLE).some((a) => a.code === "5700")).toBe(
      false,
    );
  });
});

describe("findExpenseAccountByCode", () => {
  it("finds an expense account by code", () => {
    expect(findExpenseAccountByCode(SAMPLE, "5200")?.id).toBe("2");
  });

  it("returns undefined for non-expense codes", () => {
    expect(findExpenseAccountByCode(SAMPLE, "1000")).toBeUndefined();
  });
});
