import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("CustomerDetailPage split", () => {
  it("composes ledger + dialogs via hook (not a monolith)", () => {
    const page = sourceDeclaring("CustomerDetailPage");
    expect(page).toContain("CustomerDetailLedger");
    expect(page).toContain("CustomerDetailDialogs");
    expect(page).toContain("useCustomerDetailPage");
    expect(page).toContain("customerDetailWriteChrome");
    expect(page).toContain("<EntityBalanceSticker");
  });

  it("mutation: customer/ledger fetch lives in the hook, not the page shell", () => {
    const page = sourceDeclaring("CustomerDetailPage");
    expect(page).not.toContain("apiFetch");
    expect(page).not.toContain("/customers/${customerId}/ledger");
  });

  it("drops the dead formatForexOutstanding wrapper", () => {
    const page = sourceDeclaring("CustomerDetailPage");
    expect(page).toContain("formatForexBalanceSummary");
    expect(page).not.toContain("formatForexOutstanding");
  });
});
