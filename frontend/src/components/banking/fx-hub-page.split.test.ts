import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("FxHubPageContent split", () => {
  it("composes chips + actions + ledger + dialogs via hook (not a monolith)", () => {
    const page = sourceDeclaring("FxHubPageContent");
    expect(page).toContain("FxHubWalletChips");
    expect(page).toContain("FxHubActions");
    expect(page).toContain("FxHubLedger");
    expect(page).toContain("FxHubDialogs");
    expect(page).toContain("useFxHubPage");
  });

  it("mutation: tree/ledger fetch and deactivate live in the hook, not the page shell", () => {
    const page = sourceDeclaring("FxHubPageContent");
    expect(page).not.toContain("apiFetch");
    expect(page).not.toContain("/banking/accounts/tree");
    expect(page).not.toContain("/fx/accounts/");
    expect(page).not.toContain("newIdempotencyKey");
  });
});
