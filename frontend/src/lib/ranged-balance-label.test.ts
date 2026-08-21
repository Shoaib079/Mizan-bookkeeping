/** S16 follow-up — sticker Current balance vs activity Closing in range.

Assert output labels. The sticker must never share the ranged closing wording
with the activity Closing KPI (those figures can disagree).
*/

import { describe, expect, it } from "vitest";

import { rangedBalanceLabel } from "@/lib/ranged-balance-label";
import { formatTrDate } from "@/lib/money";
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
    expect(
      rangedBalanceLabel({
        rangeTo: undefined,
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
  it("sticker is always Current balance — never rangedBalanceLabel", () => {
    const page = sourceDeclaring("SupplierDetailPage");
    expect(page).toContain('label="Current balance"');
    expect(page).not.toContain("rangedBalanceLabel");
    expect(page).not.toContain("Closing in range");
  });

  it("sticker stays Current balance even when the page owns a past activity range", () => {
    // The page still holds activityRange for the panel; the sticker label
    // must not depend on it.
    const page = sourceDeclaring("SupplierDetailPage");
    expect(page).toContain("activityRange");
    expect(page).toMatch(
      /<EntityBalanceSticker[\s\S]*?label="Current balance"/,
    );
    expect(page).not.toMatch(
      /<EntityBalanceSticker[\s\S]*?rangedBalanceLabel/,
    );
  });

  it("activity Closing KPI uses the ranged helper", () => {
    const panel = sourceDeclaring("SupplierActivityPanel");
    expect(panel).toContain("rangedBalanceLabel");
    expect(panel).toContain('currentLabel: "Closing"');
  });
});
