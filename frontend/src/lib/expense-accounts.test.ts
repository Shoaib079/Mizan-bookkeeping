import { describe, expect, it } from "vitest";

import {
  expenseAccountDisplayName,
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";

const SAMPLE: ChartAccount[] = [
  { id: "1", code: "1000", name_en: "Cash", name_tr: "Nakit", account_type: "asset" },
  {
    id: "2",
    code: "5200",
    name_en: "General Expense",
    name_tr: "Genel Giderler",
    account_type: "expense",
  },
  {
    id: "3",
    code: "5100",
    name_en: "Salaries & Wages",
    name_tr: "Maaş ve Ücretler",
    account_type: "expense",
  },
  {
    id: "5",
    code: "5210",
    name_en: "Utilities",
    name_tr: "Faturalar",
    account_type: "expense",
  },
  {
    id: "6",
    code: "5220",
    name_en: "Supplies & Ingredients",
    name_tr: "Malzeme ve Malzemeler",
    account_type: "expense",
  },
  {
    id: "4",
    code: "4000",
    name_en: "Sales Revenue",
    name_tr: "Satış Geliri",
    account_type: "revenue",
  },
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

describe("formatExpenseAccountLabel", () => {
  it("prefers Turkish name with code in parentheses", () => {
    expect(
      formatExpenseAccountLabel({
        code: "5000",
        name_en: "Rent Expense",
        name_tr: "Kira Gideri",
      }),
    ).toBe("Kira Gideri (5000)");
  });

  it("falls back to English when Turkish is empty", () => {
    expect(
      formatExpenseAccountLabel({
        code: "5200",
        name_en: "General Expense",
        name_tr: "",
      }),
    ).toBe("General Expense (5200)");
  });

  it("does not lead with GL code", () => {
    const label = formatExpenseAccountLabel(SAMPLE[1]);
    expect(label.startsWith("5200")).toBe(false);
    expect(label).toBe("Genel Giderler (5200)");
  });
});

describe("expenseAccountDisplayName", () => {
  it("uses legacy name field when bilingual names absent", () => {
    expect(
      expenseAccountDisplayName({
        code: "5210",
        name_en: "",
        name_tr: "",
        name: "Utilities",
      }),
    ).toBe("Utilities");
  });
});
