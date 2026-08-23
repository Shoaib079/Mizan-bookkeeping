import { describe, expect, it } from "vitest";

import {
  OVERVIEW_FIGURE_CLASS,
  partnerOverviewDisplay,
  payablesOverviewDisplay,
  receivablesOverviewDisplay,
  staffOverviewHint,
  staffOverviewTone,
} from "@/lib/balances-overview-display";
import { formatTry } from "@/lib/money";
import { sourceDeclaring } from "@/test-support/source";

describe("balances overview direction figures", () => {
  it("negative payables → red absolute + suppliers owe you caption", () => {
    const d = payablesOverviewDisplay(-250_000_00);
    expect(d.tone).toBe("they_owe");
    expect(d.amountKurus).toBe(250_000_00);
    expect(d.hint).toContain("suppliers owe you");
    expect(OVERVIEW_FIGURE_CLASS[d.tone]).toBe("text-[#DC2626]");
    expect(formatTry(d.amountKurus)).not.toMatch(/[-−]/);
  });

  it("positive payables → green + Total owed to suppliers", () => {
    const d = payablesOverviewDisplay(119_390_00);
    expect(d.tone).toBe("you_owe");
    expect(d.amountKurus).toBe(119_390_00);
    expect(d.hint).toBe("Total owed to suppliers");
    expect(OVERVIEW_FIGURE_CLASS[d.tone]).toBe("text-[#16A34A]");
  });

  it("positive receivables → red + Total owed to you", () => {
    const d = receivablesOverviewDisplay(80_000_00);
    expect(d.tone).toBe("they_owe");
    expect(d.amountKurus).toBe(80_000_00);
    expect(d.hint).toBe("Total owed to you");
    expect(OVERVIEW_FIGURE_CLASS[d.tone]).toBe("text-[#DC2626]");
  });

  it("zero → gray + Nothing outstanding", () => {
    for (const d of [
      payablesOverviewDisplay(0),
      receivablesOverviewDisplay(0),
      partnerOverviewDisplay(0, "existing"),
    ]) {
      expect(d.tone).toBe("settled");
      expect(d.amountKurus).toBe(0);
      expect(d.hint).toBe("Nothing outstanding");
      expect(OVERVIEW_FIGURE_CLASS[d.tone]).toBe("text-muted-foreground");
    }
    expect(staffOverviewTone(0)).toBe("settled");
    expect(staffOverviewHint(0, "Owed to employees — 2 employees")).toBe(
      "Nothing outstanding",
    );
  });

  it("partner owed-by-restaurant → green absolute + existing caption", () => {
    const hint =
      "Reimbursement / loans owed — 2 partners (capital is on each partner)";
    const d = partnerOverviewDisplay(32_500_00, hint);
    expect(d.tone).toBe("you_owe");
    expect(d.amountKurus).toBe(32_500_00);
    expect(d.hint).toBe(hint);
    expect(OVERVIEW_FIGURE_CLASS[d.tone]).toBe("text-[#16A34A]");
    expect(formatTry(d.amountKurus)).not.toMatch(/[-−]/);
  });

  it("staff owed → green; staff advances → red", () => {
    expect(staffOverviewTone(10_000)).toBe("you_owe");
    expect(staffOverviewTone(-10_000)).toBe("they_owe");
    expect(OVERVIEW_FIGURE_CLASS.you_owe).toBe("text-[#16A34A]");
    expect(OVERVIEW_FIGURE_CLASS.they_owe).toBe("text-[#DC2626]");
  });

  it("no minus character in any formatted absolute figure", () => {
    const samples = [
      payablesOverviewDisplay(-1),
      receivablesOverviewDisplay(-1),
      partnerOverviewDisplay(-99_99, "x"),
    ];
    for (const d of samples) {
      const text = formatTry(d.amountKurus);
      expect(text).not.toContain("-");
      expect(text).not.toContain("−");
      expect(d.amountKurus).toBeGreaterThanOrEqual(0);
    }
  });

  it("mutation: minus sign or gray non-zero direction figure → red", () => {
    const display = sourceDeclaring("payablesOverviewDisplay");
    const overview = sourceDeclaring("BalancesOverview");

    expect(display).toContain("Math.abs");
    expect(display).toContain("text-[#16A34A]");
    expect(display).toContain("text-[#DC2626]");
    expect(overview).toContain("payablesOverviewDisplay");
    expect(overview).toContain("receivablesOverviewDisplay");
    expect(overview).toContain("partnerOverviewDisplay");
    expect(overview).toContain("OVERVIEW_FIGURE_CLASS");
    expect(overview).toContain('figureTone="ink"');

    // Must format absolute kuruş — formatTry of the signed total is forbidden.
    expect(overview).not.toMatch(
      /amount=\{formatTry\(payables\.totalKurus\)\}/,
    );
    expect(overview).not.toMatch(
      /amount=\{formatTry\(receivables\.totalKurus\)\}/,
    );
    expect(overview).not.toMatch(
      /amount=\{formatTry\(partners\.totalKurus\)\}/,
    );

    // Non-zero direction must not use settled/muted class.
    expect(OVERVIEW_FIGURE_CLASS.you_owe).not.toBe("text-muted-foreground");
    expect(OVERVIEW_FIGURE_CLASS.they_owe).not.toBe("text-muted-foreground");

    const leakedMinus = overview.replace(
      "formatTry(payablesDisplay.amountKurus)",
      "formatTry(payables.totalKurus)",
    );
    expect(leakedMinus).toContain("formatTry(payables.totalKurus)");
    expect(overview).not.toContain("formatTry(payables.totalKurus)");
  });
});
