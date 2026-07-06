import { describe, expect, it } from "vitest";

import { currentMonthRange } from "@/lib/date-range";

describe("useCardsUrl listQuery shape", () => {
  it("builds from/to query from current month defaults", () => {
    const { from, to } = currentMonthRange();
    const params = new URLSearchParams({ from, to, limit: "50" });
    expect(params.get("from")).toBe(from);
    expect(params.get("to")).toBe(to);
    expect(params.get("limit")).toBe("50");
  });
});
