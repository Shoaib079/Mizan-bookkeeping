import { describe, expect, it } from "vitest";

async function readExpenseItemsPage() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
  );
}

describe("expense items settings page", () => {
  it("lists items via GET expense-items with debounced search", async () => {
    const source = await readExpenseItemsPage();
    expect(source).toContain("expenseItemsListUrl");
    expect(source).toContain("DataTable");
    expect(source).toContain("exp-item-search");
    expect(source).toContain("debouncedQuery");
  });

  it("calls merge endpoint with source, target, and actor ids", async () => {
    const source = await readExpenseItemsPage();
    expect(source).toContain("/expense-items/merge");
    expect(source).toContain("buildMergeExpenseItemsPayload(sourceId, targetId, actorId)");
  });

  it("requires confirm dialog before merge runs", async () => {
    const source = await readExpenseItemsPage();
    expect(source).toContain("shouldRunExpenseItemMerge");
    expect(source).toContain("confirmOpen");
    expect(source).toContain("Merge expense items?");
    expect(source).toContain("mergeExpenseItemsConfirmMessage");
  });

  it("is owner-only in the UI", async () => {
    const source = await readExpenseItemsPage();
    expect(source).toContain("canManageExpenseItems");
    expect(source).toContain("ForbiddenMessage");
  });
});
