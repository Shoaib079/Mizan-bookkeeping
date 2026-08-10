import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";



describe("cash count post-close flow", () => {
  it("goes to send-part-home after close, with float-friendly done copy", () => {
    const form = sourceDeclaring("CashDrawerCloseDayForm");
    expect(form).toContain('kind: "split"');
    expect(form).toContain('kind: "done"');
    expect(form).toContain("counter float");
    expect(form).toContain("data-testid=\"cash-count-done\"");
    expect(form).not.toContain("setClosed(null)");
    expect(form).not.toContain("Skip — keep it all here");
    expect(form).not.toContain('kind: "choose"');
  });

  it("split panel prefers sending part home and leaving float", () => {
    const split = sourceDeclaring("CashDrawerSplitPanel");
    expect(split).toContain("onKeepHere");
    expect(split).toContain("preferCashHomeDrawerId");
    expect(split).toContain("Send part home — leave float in counter");
    expect(split).toContain("Leave all in counter — done");
    expect(split).toContain("Send and finish");
    expect(split).not.toContain("Skip — keep it all here");
  });
});
