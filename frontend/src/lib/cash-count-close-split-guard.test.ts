import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

/** Close-day feature spread across form shell + hook + body (file-size split). */
function closeDaySource() {
  return sourceDeclaringAll(
    "CashDrawerCloseDayForm",
    "useCashDrawerCloseDay",
    "CashCloseDayFormBody",
    "CashCloseDayDone",
    "CashCloseDayPhase",
  );
}

describe("Count cash vs Close day split", () => {
  it("Count cash form never calls close-day API", () => {
    const count = sourceDeclaring("CashCountForm");
    expect(count).toContain("data-testid=\"cash-count-form\"");
    expect(count).toContain("not</strong> post");
    expect(count).not.toContain("drawer-sessions/close-day");
    expect(count).toContain("Continue to Close day");
  });

  it("Count cash and Close day lock to Main till; home is reference only", () => {
    const count = sourceDeclaring("CashCountForm");
    const close = closeDaySource();
    const ref = sourceDeclaring("MainTillReference");
    expect(count).toContain("MainTillReference");
    expect(count).toContain("mainTillAccount");
    expect(count).not.toContain("CashDrawerPicker");
    expect(close).toContain("MainTillReference");
    expect(close).toContain("mainTillAccount");
    expect(close).not.toContain("CashDrawerPicker");
    expect(ref).toContain("Reference only");
    expect(ref).toContain("data-testid=\"main-till-reference\"");
  });

  it("Close day posts then opens send-part-home (float stays in Main)", () => {
    const close = closeDaySource();
    expect(close).toContain("data-testid=\"close-day-form\"");
    expect(close).toContain("drawer-sessions/close-day");
    expect(close).toContain('kind: "split"');
    expect(close).toMatch(/Cash at\s+home/);
    expect(close).toContain("Using the count saved from Count cash");
    expect(close).toContain("CashDrawerSplitPanel");
  });

  it("Count/Close never create cash drawers — Banking → Cash only", () => {
    const count = sourceDeclaring("CashCountForm");
    const close = closeDaySource();
    const split = sourceDeclaring("CashDrawerSplitPanel");
    const banking = sourceDeclaring("CashDrawerPage");
    for (const src of [count, close, split]) {
      expect(src).not.toMatch(/method:\s*["']POST["'][\s\S]*banking\/accounts/);
      expect(src).not.toContain("Add cash drawer");
      expect(src).not.toContain("Add another drawer");
    }
    expect(split).toContain("Banking → Cash");
    expect(split).toContain("Send to one more place");
    expect(banking).toContain("cashPageWriteHeader");
    expect(sourceDeclaring("cashPageWriteHeader")).toContain("Add cash drawer");
  });

  it("Record desk wires both modes", () => {
    const desk = sourceDeclaring("RecordDesk");
    expect(desk).toContain('mode === "countCash"');
    expect(desk).toContain('mode === "closeDay"');
    expect(desk).toContain("CashCountForm");
    expect(desk).toContain("onContinueToCloseDay");
    expect(desk).toContain('action.id === "countCash" && cashCountDraftPending');
  });
});
