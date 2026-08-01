import { describe, expect, it } from "vitest";

import type { MoneyAccountRead } from "@/lib/banking-types";
import { bankAccountsForStatementReview } from "@/lib/load-statement-review-lines";

function account(
  overrides: Partial<MoneyAccountRead> & Pick<MoneyAccountRead, "id" | "account_kind">,
): MoneyAccountRead {
  return {
    entity_id: "ent-1",
    name: "Account",
    gl_account_id: "gl-1",
    gl_account_code: "1000",
    bank_name: null,
    iban: null,
    last_four: null,
    is_active: true,
    balance_kurus: 0,
    native_quantity: null,
    currency: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("bankAccountsForStatementReview", () => {
  it("keeps bank accounts only", () => {
    const bank = account({ id: "bank-1", account_kind: "bank", name: "İş Bank" });
    const card = account({
      id: "card-1",
      account_kind: "credit_card",
      name: "Corporate card",
    });
    const cash = account({ id: "cash-1", account_kind: "cash", name: "Drawer" });

    expect(bankAccountsForStatementReview([bank, card, cash])).toEqual([bank]);
  });
});
