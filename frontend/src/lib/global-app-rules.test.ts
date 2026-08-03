import { describe, expect, it } from "vitest";
import fs from "node:fs";

/** Guards that app rules stay centralized — not reimplemented per screen. */

describe("global app rules", () => {
  it("entity-access documents global enforcement", async () => {
    const source = await fs.promises.readFile(
      new URL("./entity-access.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("Global app rules");
    expect(source).toContain("entity-switch-policy");
    expect(source).toContain("EntitySwitchGuard");
  });

  it("entity switch policy gates setEntityId globally", async () => {
    const context = await fs.promises.readFile(
      new URL("./entity-context.tsx", import.meta.url),
      "utf8",
    );
    expect(context).toContain("maySetEntityId");
    expect(context).toContain("visibleEntities");

    const providers = await fs.promises.readFile(
      new URL("../app/providers.tsx", import.meta.url),
      "utf8",
    );
    expect(providers).toContain("EntitySwitchGuard");
  });

  it("expense item merge uses global canManageExpenseItems", async () => {
    const source = await fs.promises.readFile(
      new URL("./expense-item-merge.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('from "@/lib/entity-access"');
    expect(source).not.toMatch(/return role === "owner"/);
  });
});
