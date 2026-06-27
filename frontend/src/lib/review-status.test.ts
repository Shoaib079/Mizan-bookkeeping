import { describe, expect, it } from "vitest";

import { isReviewTerminalStatus } from "@/lib/review-status";

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
