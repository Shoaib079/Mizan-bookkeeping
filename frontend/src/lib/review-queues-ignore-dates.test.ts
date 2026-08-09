/**
 * A review queue never hides outstanding work behind a date.
 *
 * The badge on every review tab counts by *status*, across all dates — see
 * `review_counts/service.py`, which has no date clause anywhere. The lists
 * used to filter by a date range defaulting to the current month. So the tab
 * could say 3 and the list show none, and the first thing anyone reaches for
 * is the date picker, and it is never the reason.
 *
 * That is how a supplier invoice misread as 16.09.2026 became invisible: the
 * money was in payables, the badge knew, and every screen that could have
 * shown it was scoped to this month.
 *
 * Written over the filter sets rather than per filter, so a queue added later
 * is covered on the day it is added rather than the day it goes wrong.
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
    name: "sales",
    views: SALES_REVIEW_FILTERS.map((f) => f.id),
    usesRange: salesFilterUsesRange as (view: never) => boolean,
  },
  {
    name: "invoices",
    // Read from the exported list, not retyped here. A hardcoded copy would
    // stop covering the tab someone adds next, which is the same staleness
    // the rule below is about.
    views: INVOICE_REVIEW_TABS.map((t) => t.id),
    usesRange: invoiceReviewTabUsesRange as (view: never) => boolean,
  },
];

describe("review queues ignore dates", () => {
  it("covers every queue that has a date picker", () => {
    // Guard the guard: over an empty list the assertions below prove nothing,
    // which is the failure this whole file exists to stop.
    expect(QUEUES.length).toBeGreaterThanOrEqual(3);
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
      // The other half. Without it, a `usesRange` that always returned false
      // would satisfy the test above and quietly break every report period.
      const settled = queue.views.filter((view) => SETTLED.has(view));
      expect(settled.length).toBeGreaterThan(0);
      for (const view of settled) {
        expect(queue.usesRange(view as never)).toBe(true);
      }
    });
  }
});
