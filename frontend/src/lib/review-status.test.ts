import { describe, expect, it } from "vitest";

import {
  canDiscardInvoiceDraft,
  canUnconfirmInvoiceDraft,
  isInvoiceWorkbenchStatus,
  isPendingReviewStatus,
  isReadyToPostInvoiceStatus,
  isReviewTerminalStatus,
} from "@/lib/review-status";

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
    expect(isPendingReviewStatus("confirmed")).toBe(false);
    expect(isPendingReviewStatus("posted")).toBe(false);
  });
});

describe("isReadyToPostInvoiceStatus", () => {
  it("includes confirmed only", () => {
    expect(isReadyToPostInvoiceStatus("confirmed")).toBe(true);
    expect(isReadyToPostInvoiceStatus("draft")).toBe(false);
  });
});

describe("isInvoiceWorkbenchStatus", () => {
  it("excludes posted and rejected", () => {
    expect(isInvoiceWorkbenchStatus("confirmed")).toBe(true);
    expect(isInvoiceWorkbenchStatus("posted")).toBe(false);
    expect(isInvoiceWorkbenchStatus("rejected")).toBe(false);
  });
});

describe("canDiscardInvoiceDraft", () => {
  it("allows discard through confirmed (IC-A)", () => {
    expect(canDiscardInvoiceDraft("confirmed")).toBe(true);
    expect(canDiscardInvoiceDraft("draft")).toBe(true);
    expect(canDiscardInvoiceDraft("posted")).toBe(false);
  });
});

describe("canUnconfirmInvoiceDraft", () => {
  it("allows unconfirm only on confirmed", () => {
    expect(canUnconfirmInvoiceDraft("confirmed")).toBe(true);
    expect(canUnconfirmInvoiceDraft("draft")).toBe(false);
  });
});
