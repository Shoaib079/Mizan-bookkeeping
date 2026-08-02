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

  it("Close day posts then opens send-part-home (float stays in Main)", () => {
    const close = read("components/forms/cash-drawer-close-day-form.tsx");
    expect(close).toContain("data-testid=\"close-day-form\"");
    expect(close).toContain("drawer-sessions/close-day");
    expect(close).toContain('kind: "split"');
    expect(close).toContain("Cash at home");
    expect(close).toContain("Using the count saved from Count cash");
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
