import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Count cash vs Close day split", () => {
  it("Count cash form never calls close-day API", () => {
    const count = read("components/forms/cash-count-form.tsx");
    expect(count).toContain("data-testid=\"cash-count-form\"");
    expect(count).toContain("not</strong> post");
    expect(count).not.toContain("drawer-sessions/close-day");
    expect(count).toContain("Continue to Close day");
  });

  it("Count cash and Close day lock to Main till; home is reference only", () => {
    const count = read("components/forms/cash-count-form.tsx");
    const close = read("components/forms/cash-drawer-close-day-form.tsx");
    const ref = read("components/forms/main-till-reference.tsx");
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
    const close = read("components/forms/cash-drawer-close-day-form.tsx");
    expect(close).toContain("data-testid=\"close-day-form\"");
    expect(close).toContain("drawer-sessions/close-day");
    expect(close).toContain('kind: "split"');
    expect(close).toMatch(/Cash at\s+home/);
    expect(close).toContain("Using the count saved from Count cash");
    expect(close).toContain("CashDrawerSplitPanel");
  });

  it("Count/Close never create cash drawers — Banking → Cash only", () => {
    const count = read("components/forms/cash-count-form.tsx");
    const close = read("components/forms/cash-drawer-close-day-form.tsx");
    const split = read("components/forms/cash-drawer-split-panel.tsx");
    const banking = read("app/banking/cash/page.tsx");
    for (const src of [count, close, split]) {
      expect(src).not.toMatch(/method:\s*["']POST["'][\s\S]*banking\/accounts/);
      expect(src).not.toContain("Add cash drawer");
      expect(src).not.toContain("Add another drawer");
    }
    expect(split).toContain("Banking → Cash");
    expect(split).toContain("Send to one more place");
    expect(banking).toContain("Add cash drawer");
  });

  it("Record desk wires both modes", () => {
    const desk = read("components/record/record-desk.tsx");
    expect(desk).toContain('mode === "countCash"');
    expect(desk).toContain('mode === "closeDay"');
    expect(desk).toContain("CashCountForm");
    expect(desk).toContain("onContinueToCloseDay");
    expect(desk).toContain('action.id === "countCash" && cashCountDraftPending');
  });
});
