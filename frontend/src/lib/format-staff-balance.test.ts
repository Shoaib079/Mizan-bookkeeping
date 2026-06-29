import { describe, expect, it } from "vitest";

import { formatStaffBalanceMinor } from "@/lib/format-staff-balance";

describe("formatStaffBalanceMinor", () => {
  it("formats TRY balances with lira helper", () => {
    expect(formatStaffBalanceMinor(150_50, "TRY")).toBe("150,50 ₺");
  });

  it("formats FX balances with currency code", () => {
    expect(formatStaffBalanceMinor(12_345, "USD")).toBe("123.45 USD");
  });
});
