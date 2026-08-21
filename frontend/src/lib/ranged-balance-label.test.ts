/** S16 follow-up — direction heading + Current balance caption vs Closing.

Sticker: balanceHeading direction + "Current balance" caption (today's
ledger). Never "Closing in range". Activity Closing alone uses the ranged
helper with the range-closing figure.
*/

import { describe, expect, it } from "vitest";

import { rangedBalanceLabel } from "@/lib/ranged-balance-label";
import { formatTrDate } from "@/lib/money";
import { supplierBalanceHeading } from "@/lib/supplier-balance";
import { sourceDeclaring } from "@/test-support/source";

const TODAY = "2026-08-21";
const CLOSING = "Closing";

describe("rangedBalanceLabel (activity Closing only)", () => {
  it("uses Closing when no range is applied", () => {
    expect(
      rangedBalanceLabel({
        rangeTo: null,
        currentLabel: CLOSING,
        today: TODAY,
      }),
    ).toBe(CLOSING);
  });

  it("keeps Closing for month-to-date ending today", () => {
    expect(
      rangedBalanceLabel({
        rangeTo: TODAY,
        currentLabel: CLOSING,
        today: TODAY,
      }),
    ).toBe(CLOSING);
  });

  it("uses Closing in range · as of [to] when the range ends before today", () => {
    const to = "2026-06-30";
    expect(
      rangedBalanceLabel({
        rangeTo: to,
        currentLabel: CLOSING,
        today: TODAY,
      }),
    ).toBe(`Closing in range · as of ${formatTrDate(to)}`);
  });
});

describe("supplier sticker vs activity Closing labels", () => {
  it("sticker uses direction heading + Current balance caption", () => {
    const page = sourceDeclaring("SupplierDetailPage");
    expect(page).toContain("supplierBalanceHeading(ledger.balance_kurus)");
    expect(page).toContain('caption="Current balance"');
    expect(page).not.toContain("rangedBalanceLabel");
    expect(page).not.toContain("Closing in range");
    // Direction wording comes from the shared helper — not a second rule.
    expect(supplierBalanceHeading(50_000)).toBe("You owe supplier");
    expect(supplierBalanceHeading(-50_000)).toBe("Supplier owes you");
    expect(supplierBalanceHeading(0)).toBe("Settled");
  });

  it("sticker keeps direction + Current balance when the page owns a past range", () => {
    const page = sourceDeclaring("SupplierDetailPage");
    expect(page).toContain("activityRange");
    expect(page).toMatch(
      /<EntityBalanceSticker[\s\S]*?supplierBalanceHeading\(ledger\.balance_kurus\)/,
    );
    expect(page).toMatch(
      /<EntityBalanceSticker[\s\S]*?caption="Current balance"/,
    );
    expect(page).not.toMatch(
      /<EntityBalanceSticker[\s\S]*?rangedBalanceLabel/,
    );
    expect(page).not.toContain("Closing in range");
  });

  it("sticker component supports an optional caption slot", () => {
    const sticker = sourceDeclaring("EntityBalanceSticker");
    expect(sticker).toContain("caption?: string");
    expect(sticker).toContain("{caption}");
  });

  it("activity Closing KPI uses the ranged helper", () => {
    const panel = sourceDeclaring("SupplierActivityPanel");
    expect(panel).toContain("rangedBalanceLabel");
    expect(panel).toContain('currentLabel: "Closing"');
  });
});
