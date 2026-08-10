/** "Income to bank" — the inflow catch-all.
 *
 * Every outflow could always fall back to "Expense from bank"; inflows had no
 * equivalent, so bank interest, a supplier refund or an insurance payout could
 * not be classified at all and the account never reached "Reconciled".
 */

import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import { filterRevenueAccounts, type ChartAccount } from "@/lib/expense-accounts";
import {
  classificationMatchesAmount,
  classificationOption,
  classificationOptionsForAmount,
} from "@/lib/statement-classification-options";
import {
  buildClassifyLinePayload,
  targetsRequiredForClassification,
} from "@/lib/statement-classify-payload";
import type { StatementLineFormTargets } from "@/lib/statement-line-form-state";

const targets: StatementLineFormTargets = {
  classification: "other_income",
  supplierId: "",
  customerId: "",
  employeeId: "",
  partnerId: "",
  note: "",
  counterpartId: "",
  creditCardId: "",
  expenseAccountId: "",
  incomeAccountId: "acct-interest",
  deliveryPlatformId: "",
};

function inflowLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    id: "line-1",
    statement_id: "stmt-1",
    transaction_date: "2026-06-15",
    amount_kurus: 125_000,
    description: "FAIZ GELIRI",
    reference: "REF-1",
    classification: "unclassified",
    status: "imported",
    supplier_id: null,
    review_reason: null,
    journal_entry_id: null,
    ...overrides,
  };
}

describe("other_income option", () => {
  it("is offered on money in and withheld on money out", () => {
    const inflow = classificationOptionsForAmount(125_000).map((o) => o.value);
    const outflow = classificationOptionsForAmount(-125_000).map((o) => o.value);
    expect(inflow).toContain("other_income");
    expect(outflow).not.toContain("other_income");
  });

  it("gives inflows the catch-all that outflows already had", () => {
    // The gap this closes: rent_utility caught any outflow; nothing caught inflows.
    const inflowCatchAll = classificationOptionsForAmount(1).find(
      (o) => o.target === "income",
    );
    const outflowCatchAll = classificationOptionsForAmount(-1).find(
      (o) => o.value === "rent_utility",
    );
    expect(inflowCatchAll?.value).toBe("other_income");
    expect(outflowCatchAll).toBeDefined();
  });

  it("refuses to match a negative amount", () => {
    expect(classificationMatchesAmount("other_income", 125_000)).toBe(true);
    expect(classificationMatchesAmount("other_income", -125_000)).toBe(false);
  });

  it("asks for an income account, not a person", () => {
    expect(classificationOption("other_income")?.target).toBe("income");
  });
});

describe("other_income payload", () => {
  it("sends the chosen income account", () => {
    const body = buildClassifyLinePayload(inflowLine(), {
      actorId: "actor-1",
      classification: "other_income",
      targets,
    });
    expect(body.income_account_id).toBe("acct-interest");
    expect(body.expense_account_id).toBeUndefined();
  });

  it("blocks submit until an account is picked", () => {
    expect(targetsRequiredForClassification("other_income", targets)).toBe(false);
    expect(
      targetsRequiredForClassification("other_income", {
        ...targets,
        incomeAccountId: "",
      }),
    ).toBe(true);
  });
});

describe("income account list", () => {
  /** The real chart's codes and names.
   *
   * This fixture used to invent its own — 4200 labelled "Interest Income",
   * 4300 labelled "FX Gain" — and the assertions agreed with the invention
   * rather than with the app. In the chart, 4200 *is* FX Gain and 4300 is
   * Group / Agency Sales, so the test asserted that FX Gain should be
   * offered for hand-picking, which is the opposite of the rule it sits
   * beside. A fixture that makes up its own facts can only ever test itself.
   */
  const chart: ChartAccount[] = [
    { id: "a", code: "4000", name_en: "Sales Revenue", name_tr: "Satış Geliri", account_type: "revenue" },
    { id: "b", code: "4100", name_en: "Other Income", name_tr: "Diğer Gelirler", account_type: "revenue" },
    { id: "c", code: "4200", name_en: "FX Gain", name_tr: "Kur Kazancı", account_type: "revenue" },
    { id: "d", code: "4300", name_en: "Group / Agency Sales", name_tr: "Grup Satışları", account_type: "revenue" },
    { id: "e", code: "5200", name_en: "General Expense", name_tr: "Genel Giderler", account_type: "expense" },
  ];

  it("offers revenue only — crediting an expense would book a refund", () => {
    const codes = filterRevenueAccounts(chart).map((a) => a.code);
    expect(codes).toContain("4100");
    expect(codes).not.toContain("5200");
  });

  it("keeps system-owned revenue accounts out of hand-picking", () => {
    // Both are posted by the flow that owns them. Choosing either by hand
    // credits it a second time: a currency gain that never happened, or a
    // group sale counted twice.
    const codes = filterRevenueAccounts(chart).map((a) => a.code);
    expect(codes).not.toContain("4200");
    expect(codes).not.toContain("4300");
  });
});
