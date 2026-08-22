import { describe, expect, it } from "vitest";

import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

describe("formatVoidConfirmDetail", () => {
  it("joins date, type, and amount", () => {
    expect(
      formatVoidConfirmDetail({
        date: "01.08.2026",
        type: "Payment received",
        amount: "1.200,00 ₺",
      }),
    ).toBe("01.08.2026 · Payment received · 1.200,00 ₺");
  });

  it("falls back to description when structured fields are missing", () => {
    expect(formatVoidConfirmDetail({ description: "Metro invoice" })).toBe(
      "Metro invoice",
    );
  });
});
