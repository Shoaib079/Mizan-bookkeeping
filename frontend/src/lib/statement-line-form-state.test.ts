import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import {
  hydrateStatementLineFormState,
  postedLineTargetSummary,
} from "@/lib/statement-line-form-state";

const pickers: StatementClassificationPickers = {
  suppliers: [
    { id: "sup-1", name: "Ahmet Erceyis (Ramazan Memiş)" },
    { id: "sup-genc", name: "Genç Ticaret (Mithat Genç)" },
  ],
  customers: [],
  employees: [],
  partners: [],
  moneyAccounts: [],
  creditCards: [],
  expenseAccounts: [],
  deliveryPlatforms: [],
  deliveryPlatformsError: null,
  loading: false,
  error: null,
  reload: async () => {},
  appendExpenseAccount: () => {},
};

function postedSupplierLine(
  overrides: Partial<BankStatementLine> = {},
): BankStatementLine {
  return {
    id: "line-1",
    statement_id: "stmt-1",
    transaction_date: "2026-05-05",
    amount_kurus: -2_000_000,
    description: "GİDEN FAST - Mithat Genç - Tüp ödemesi",
    reference: null,
    classification: "supplier_payment",
    status: "posted",
    supplier_id: "sup-genc",
    review_reason: null,
    journal_entry_id: "je-1",
    ...overrides,
  };
}

describe("hydrateStatementLineFormState", () => {
  it("uses stored supplier_id for correct — never first supplier in list", () => {
    const hydrated = hydrateStatementLineFormState(
      postedSupplierLine(),
      pickers,
      "correct",
    );
    expect(hydrated.classification).toBe("supplier_payment");
    expect(hydrated.supplierId).toBe("sup-genc");
  });

  it("falls back to first supplier only for unposted queue lines", () => {
    const hydrated = hydrateStatementLineFormState(
      postedSupplierLine({
        status: "imported",
        classification: "unclassified",
        supplier_id: null,
        journal_entry_id: null,
      }),
      pickers,
      "post",
    );
    expect(hydrated.supplierId).toBe("sup-1");
  });

  it("uses stored partner_id for correct — never first partner in list", () => {
    const hydrated = hydrateStatementLineFormState(
      postedSupplierLine({
        classification: "partner_drawing_repayment",
        supplier_id: null,
        partner_id: "partner-1",
      }),
      {
        ...pickers,
        partners: [
          { id: "partner-0", name: "First Partner" },
          { id: "partner-1", name: "Ahmet Partner" },
        ],
      },
      "correct",
    );
    expect(hydrated.partnerId).toBe("partner-1");
  });
});

describe("postedLineTargetSummary", () => {
  it("shows linked supplier name from line.supplier_id", () => {
    expect(postedLineTargetSummary(postedSupplierLine(), pickers)).toBe(
      "Genç Ticaret (Mithat Genç)",
    );
  });

  it("shows linked partner name from line.partner_id", () => {
    expect(
      postedLineTargetSummary(
        postedSupplierLine({
          classification: "partner_drawing_repayment",
          supplier_id: null,
          partner_id: "partner-1",
        }),
        {
          ...pickers,
          partners: [{ id: "partner-1", name: "Ahmet Partner" }],
        },
      ),
    ).toBe("Ahmet Partner");
  });

  it("shows linked employee name from line.employee_id", () => {
    expect(
      postedLineTargetSummary(
        postedSupplierLine({
          classification: "staff_payment",
          supplier_id: null,
          employee_id: "emp-1",
        }),
        {
          ...pickers,
          employees: [{ id: "emp-1", name: "Ali Yilmaz" }],
        },
      ),
    ).toBe("Ali Yilmaz");
  });
});
