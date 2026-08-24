import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("GroupSaleForm split", () => {
  it("composes header + lines + footer via hook (not a monolith)", () => {
    const form = sourceDeclaring("GroupSaleForm");
    expect(form).toContain("GroupSaleFormHeaderFields");
    expect(form).toContain("GroupSaleFormLines");
    expect(form).toContain("GroupSaleFormFooter");
    expect(form).toContain("useGroupSaleForm");
  });

  it("mutation: posting lives in the hook, not the form shell", () => {
    const form = sourceDeclaring("GroupSaleForm");
    expect(form).not.toContain("apiFetch");
    expect(form).not.toContain("beginSubmit");
    expect(form).not.toMatch(/entities\/\$\{entityId\}\/group-sales/);
  });
});
