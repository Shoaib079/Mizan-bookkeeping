import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("StatementBulkActionBar split", () => {
  it("composes form via hook and reuses StatementClassifyTargetControl", () => {
    const bar = sourceDeclaring("StatementBulkActionBar");
    expect(bar).toContain("StatementBulkActionForm");
    expect(bar).toContain("useStatementBulkActionBar");

    const form = sourceDeclaring("StatementBulkActionForm");
    expect(form).toContain("StatementClassifyTargetControl");
    expect(form).toContain('variant="bulk"');
  });

  it("mutation: bulk runner lives in the hook", () => {
    const bar = sourceDeclaring("StatementBulkActionBar");
    expect(bar).not.toContain("runStatementBulkAction");
    expect(sourceDeclaring("useStatementBulkActionBar")).toContain(
      "runStatementBulkAction",
    );
  });
});
