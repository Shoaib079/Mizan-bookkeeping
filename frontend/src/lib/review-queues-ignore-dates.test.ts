/**
 * A review queue never hides outstanding work behind a date.
 *
 * The badge on every review tab counts by *status*, across all dates — see
 * `review_counts/service.py`, which has no date clause anywhere. The lists
 * used to filter by a date range defaulting to the current month. So the tab
 * could say 3 and the list show none, and the first thing anyone reaches for
 * is the date picker, and it is never the reason.
 *
 * Sales is a special case: All and Posted honour the period; Needs review
 * still must not — that is the outstanding-work queue.
 */

import { describe, expect, it } from "vitest";

import {
  INVOICE_REVIEW_TABS,
  invoiceReviewTabUsesRange,
} from "@/lib/invoice-draft-list";
import {
  EXPENSE_REVIEW_FILTERS,
  expenseFilterUsesRange,
} from "@/lib/use-expenses-review-url";
import {
  SALES_REVIEW_FILTERS,
  salesFilterUsesRange,
} from "@/lib/use-sales-review-url";

/** Views that contain only settled rows. Everything else holds outstanding
 * work, and outstanding work is what a badge counts. */
const SETTLED = new Set(["posted", "voided"]);

const QUEUES: {
  name: string;
  views: string[];
  usesRange: (view: never) => boolean;
}[] = [
  {
    name: "expenses",
    views: EXPENSE_REVIEW_FILTERS.map((f) => f.id),
    usesRange: expenseFilterUsesRange as (view: never) => boolean,
  },
  {
    name: "invoices",
    views: INVOICE_REVIEW_TABS.map((t) => t.id),
    usesRange: invoiceReviewTabUsesRange as (view: never) => boolean,
  },
];

describe("review queues ignore dates", () => {
  it("covers every queue that has a date picker", () => {
    expect(QUEUES.length).toBeGreaterThanOrEqual(2);
    for (const queue of QUEUES) {
      expect(queue.views.length).toBeGreaterThan(1);
    }
  });

  for (const queue of QUEUES) {
    it(`${queue.name}: no view with outstanding work is narrowed by date`, () => {
      const wrong = queue.views.filter(
        (view) => !SETTLED.has(view) && queue.usesRange(view as never),
      );
      expect(wrong).toEqual([]);
    });

    it(`${queue.name}: settled views still honour the range`, () => {
      const settled = queue.views.filter((view) => SETTLED.has(view));
      expect(settled.length).toBeGreaterThan(0);
      for (const view of settled) {
        expect(queue.usesRange(view as never)).toBe(true);
      }
    });
  }
});

describe("sales Needs review ignores dates", () => {
  it("covers All / Needs review / Posted", () => {
    expect(SALES_REVIEW_FILTERS.map((f) => f.id)).toEqual([
      "all",
      "pending",
      "posted",
    ]);
  });

  it("Needs review is not narrowed by date", () => {
    expect(salesFilterUsesRange("pending")).toBe(false);
  });

  it("All and Posted honour the period", () => {
    expect(salesFilterUsesRange("all")).toBe(true);
    expect(salesFilterUsesRange("posted")).toBe(true);
  });
});
