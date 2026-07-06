/**
 * Tests for the Review hub smart-redirect logic.
 *
 * Mirrors the effect logic in review/page.tsx: redirect to the first
 * non-zero tab once counts load; skip stale counts on entity switch.
 */
import { describe, expect, it } from "vitest";

import type { ReviewTabCounts } from "@/lib/review-counts-types";
import { firstNonZeroReviewHref } from "@/lib/review-tab-counts";

const ZERO: ReviewTabCounts = {
  bank: 0,
  invoices: 0,
  sales: 0,
  receipts: 0,
  expenses: 0,
  delivery: 0,
};

type RedirectState = {
  loading: boolean;
  entityId: string;
  byTab: ReviewTabCounts;
  prevEntityId: string;
};

type RedirectResult = {
  shouldRedirect: boolean;
  href: string | null;
  nextPrevEntityId: string;
};

/**
 * Pure extraction of the useEffect logic from ReviewIndexPage.
 * prevEntityId mirrors useRef(entityId) — initialized to entityId on mount.
 */
function computeRedirect(state: RedirectState): RedirectResult {
  const { loading, entityId, byTab, prevEntityId } = state;

  if (loading || !entityId) {
    return { shouldRedirect: false, href: null, nextPrevEntityId: prevEntityId };
  }

  if (prevEntityId !== entityId) {
    return { shouldRedirect: false, href: null, nextPrevEntityId: entityId };
  }

  return {
    shouldRedirect: true,
    href: firstNonZeroReviewHref(byTab),
    nextPrevEntityId: entityId,
  };
}

describe("review smart redirect", () => {
  it("redirects to /review/invoices when only invoices have items", () => {
    const result = computeRedirect({
      loading: false,
      entityId: "e1",
      byTab: { ...ZERO, invoices: 3 },
      prevEntityId: "e1",
    });
    expect(result.shouldRedirect).toBe(true);
    expect(result.href).toBe("/review/invoices");
  });

  it("redirects to /review/bank when all counts are zero", () => {
    const result = computeRedirect({
      loading: false,
      entityId: "e1",
      byTab: ZERO,
      prevEntityId: "e1",
    });
    expect(result.shouldRedirect).toBe(true);
    expect(result.href).toBe("/review/bank");
  });

  it("does not redirect while counts are loading", () => {
    const result = computeRedirect({
      loading: true,
      entityId: "e1",
      byTab: { ...ZERO, invoices: 5 },
      prevEntityId: "e1",
    });
    expect(result.shouldRedirect).toBe(false);
  });

  it("does not redirect without an entity", () => {
    const result = computeRedirect({
      loading: false,
      entityId: "",
      byTab: { ...ZERO, bank: 2 },
      prevEntityId: "",
    });
    expect(result.shouldRedirect).toBe(false);
  });

  it("skips redirect on entity switch (stale counts from previous entity)", () => {
    const result = computeRedirect({
      loading: false,
      entityId: "e2",
      byTab: { ...ZERO, bank: 10 },
      prevEntityId: "e1",
    });
    expect(result.shouldRedirect).toBe(false);
    expect(result.nextPrevEntityId).toBe("e2");
  });

  it("redirects after entity switch once fresh counts arrive", () => {
    // Step 1: entity switches — prevEntityId still old
    const step1 = computeRedirect({
      loading: false,
      entityId: "e2",
      byTab: { ...ZERO, bank: 10 },
      prevEntityId: "e1",
    });
    expect(step1.shouldRedirect).toBe(false);
    expect(step1.nextPrevEntityId).toBe("e2");

    // Step 2: loading starts for new entity
    const step2 = computeRedirect({
      loading: true,
      entityId: "e2",
      byTab: ZERO,
      prevEntityId: step1.nextPrevEntityId,
    });
    expect(step2.shouldRedirect).toBe(false);

    // Step 3: fresh counts arrive for new entity
    const step3 = computeRedirect({
      loading: false,
      entityId: "e2",
      byTab: { ...ZERO, sales: 4 },
      prevEntityId: step2.nextPrevEntityId,
    });
    expect(step3.shouldRedirect).toBe(true);
    expect(step3.href).toBe("/review/sales");
  });

  it("initial mount with loading=true waits, then redirects on load", () => {
    // Mount: ref initialized to entityId, hook starts with loading=true
    const mount = computeRedirect({
      loading: true,
      entityId: "e1",
      byTab: ZERO,
      prevEntityId: "e1",
    });
    expect(mount.shouldRedirect).toBe(false);

    // After fetch completes with real counts:
    const loaded = computeRedirect({
      loading: false,
      entityId: "e1",
      byTab: { ...ZERO, delivery: 2 },
      prevEntityId: mount.nextPrevEntityId,
    });
    expect(loaded.shouldRedirect).toBe(true);
    expect(loaded.href).toBe("/review/delivery");
  });
});
