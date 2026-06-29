import { describe, expect, it } from "vitest";

import { isPendingReviewStatus, isReviewTerminalStatus } from "@/lib/review-status";

describe("isReviewTerminalStatus", () => {
  it("treats posted and rejected as terminal", () => {
    expect(isReviewTerminalStatus("posted")).toBe(true);
    expect(isReviewTerminalStatus("rejected")).toBe(true);
  });

  it("allows draft and needs_review", () => {
    expect(isReviewTerminalStatus("draft")).toBe(false);
    expect(isReviewTerminalStatus("needs_review")).toBe(false);
  });
});

describe("isPendingReviewStatus", () => {
  it("includes draft, needs_review, and duplicate", () => {
    expect(isPendingReviewStatus("draft")).toBe(true);
    expect(isPendingReviewStatus("needs_review")).toBe(true);
    expect(isPendingReviewStatus("duplicate")).toBe(true);
    expect(isPendingReviewStatus("posted")).toBe(false);
  });
});
