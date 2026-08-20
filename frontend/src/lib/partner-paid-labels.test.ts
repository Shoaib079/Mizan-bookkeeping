/** Partner UI wording — "partner paid", never user-facing "fronted". */

import { describe, expect, it } from "vitest";

import { partnerMovementLabels } from "@/lib/subledger-labels";
import { sourceDeclaring } from "@/test-support/source";

describe("partner paid labels (not fronted)", () => {
  it("ledger movement label matches expense form wording", () => {
    expect(partnerMovementLabels.expense_fronted).toBe("Partner paid expense");
    expect(partnerMovementLabels.expense_fronted).not.toMatch(/fronted/i);
  });

  it("keeps code keys and API path names unchanged", () => {
    const labels = sourceDeclaring("partnerMovementLabels");
    expect(labels).toContain("expense_fronted:");
    expect(labels).toContain("salary_fronted:");

    const expenseForm = sourceDeclaring("ManualExpenseForm");
    expect(expenseForm).toContain("expenses-fronted");
    expect(expenseForm).toContain("Partner paid (owe partner)");
  });

  it("Record / review / classify copy say partner paid, not fronted", () => {
    const desk = sourceDeclaring("DESK_HINTS");
    expect(desk).toContain("Cash or partner paid");
    expect(desk).not.toMatch(/partner-fronted/i);

    const actions = sourceDeclaring("RECORD_ACTIONS");
    expect(actions).toContain("Cash or partner paid");
    expect(actions).not.toContain("partner-fronted");

    const scope = sourceDeclaring("ExpensesScopeNote");
    expect(scope).toContain("partner-paid");
    expect(scope).not.toMatch(/fronted/i);

    const classify = sourceDeclaring("STATEMENT_CLASSIFICATION_OPTIONS");
    expect(classify).toContain("Repay partner (partner-paid expenses)");
    expect(classify).not.toContain("fronted expenses");
  });
});
