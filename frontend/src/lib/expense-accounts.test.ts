import { describe, expect, it } from "vitest";

import {
  expenseAccountDisplayName,
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  mergeExpenseAccounts,
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
      "5210",
      "5220",
    ]);
  });

  it("includes custom owner categories in the 5900 band", () => {
    const custom: ChartAccount = {
      id: "9",
      code: "5900",
      name_en: "Packaging",
      name_tr: "Packaging",
      account_type: "expense",
    };
    expect(filterExpenseAccounts([...SAMPLE, custom]).map((a) => a.code)).toContain(
      "5900",
    );
  });
});

describe("mergeExpenseAccounts", () => {
  it("appends a new category without refetching the full chart", () => {
    const created: ChartAccount = {
      id: "99",
      code: "5901",
      name_en: "Misc",
      name_tr: "Misc",
      account_type: "expense",
    };
    const merged = mergeExpenseAccounts(SAMPLE, created);
    expect(merged.some((a) => a.id === "99")).toBe(true);
    expect(merged.map((a) => a.code)).toContain("5901");
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
  it("shows English name with GL code prefix", () => {
    expect(
      formatExpenseAccountLabel({
        code: "5000",
        name_en: "Rent Expense",
        name_tr: "Kira Gideri",
      }),
    ).toBe("5000 — Rent Expense");
  });

  it("falls back to Turkish when English is empty", () => {
    expect(
      formatExpenseAccountLabel({
        code: "5200",
        name_en: "",
        name_tr: "Genel Giderler",
      }),
    ).toBe("5200 — Genel Giderler");
  });

  it("uses English for general expense accounts", () => {
    const label = formatExpenseAccountLabel(SAMPLE[1]);
    expect(label).toBe("5200 — General Expense");
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
