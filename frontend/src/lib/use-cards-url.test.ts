import { describe, expect, it } from "vitest";

import { currentMonthRange } from "@/lib/date-range";

describe("useCardsUrl listQuery shape", () => {
  it("builds from/to query from current month defaults", () => {
    const aug3 = new Date(2026, 7, 3);
    const { from, to } = currentMonthRange(aug3);
    expect(from).toBe("2026-08-01");
    expect(to).toBe("2026-08-03");
    expect(to).not.toBe("2026-08-31");
    const params = new URLSearchParams({ from, to, limit: "50" });
    expect(params.get("from")).toBe(from);
    expect(params.get("to")).toBe(to);
    expect(params.get("limit")).toBe("50");
  });
});
