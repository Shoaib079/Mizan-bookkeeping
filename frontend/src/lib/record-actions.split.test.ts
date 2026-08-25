import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("record-actions split", () => {
  it("barrel re-exports types, catalog, and helpers", () => {
    const barrel = sourceAt("lib/record-actions.ts");
    expect(barrel).toContain('from "@/lib/record-actions-types"');
    expect(barrel).toContain('from "@/lib/record-actions-catalog"');
    expect(barrel).toContain('from "@/lib/record-actions-helpers"');
    expect(barrel).toContain("RECORD_ACTIONS");
    expect(barrel).toContain("filterRecordActions");
    expect(barrel).toContain("isQuickActionKey");
  });

  it("catalog owns RECORD_ACTIONS; helpers own filtering", () => {
    expect(sourceDeclaring("RECORD_ACTIONS")).toContain('id: "addDocument"');
    expect(sourceDeclaring("filterRecordActions")).toContain(
      "canUseRecordAction",
    );
    expect(sourceDeclaring("isQuickActionKey")).toContain("QUICK_ACTION_KEYS");
  });
});
