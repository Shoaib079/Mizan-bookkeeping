import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Guards that app rules stay centralized — not reimplemented per screen. */

describe("global app rules", () => {
  it("entity-access documents global enforcement", async () => {
    const source = sourceDeclaring("DashboardKpi");
    expect(source).toContain("Global app rules");
    expect(source).toContain("useEntityAccess()");
    expect(source).toContain("member-grants");
  });

  it("entity switch policy gates setEntityId globally", async () => {
    const context = sourceDeclaring("EntityProvider");
    expect(context).toContain("maySetEntityId");
    expect(context).toContain("visibleEntities");

    const providers = sourceDeclaring("Providers");
    expect(providers).toContain("EntitySwitchGuard");
    expect(providers).toContain("RouteAccessGuard");
  });

  it("expense item merge uses global canManageExpenseItems", async () => {
    const source = sourceDeclaring("ExpenseItemRow");
    expect(source).toContain('from "@/lib/entity-access"');
    expect(source).not.toMatch(/return role === "owner"/);
  });
});
