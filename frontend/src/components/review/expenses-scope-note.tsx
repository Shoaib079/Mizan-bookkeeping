"use client";

import Link from "next/link";

import { REVIEW_TAB_HREFS } from "@/lib/review-routes";

/** What this page lists, and — the part that was missing — what it does not.
 *
 * The page is called Expenses and does not show all of them. Salaries,
 * supplier invoices, delivery commission, bank fees and FX spend are expenses
 * in the ledger and in the P&L, but each is recorded in its own flow and none
 * of them becomes an `ExpenseEntry` row. So the total here is correct for what
 * it counts and wrong for what the page is named, and the way that surfaced
 * was an owner saying "my expenses do not match — I have to go to Staff to
 * check what happened".
 *
 * Nothing is wrong with the books: `expense_register` reads the ledger and
 * ties to the P&L for the same range. It is a label problem, the same one as
 * "Period total" over a list that spans every date.
 *
 * Its own component because it is pure copy with no state and no props — the
 * one kind of thing that can be lifted out of a 442-line panel without any
 * risk of changing behaviour, which is the honest way to answer the file-size
 * ratchet on a component this project cannot test.
 */
export function ExpensesScopeNote() {
  return (
    <div className="max-w-3xl space-y-2">
      <p className="text-sm text-muted-foreground">
        Cash and partner-fronted expenses posted here — correct mistakes below.
        Bank and card charges are classified on the bank statement (not entered
        manually). Receipt photos are in{" "}
        <Link
          href={REVIEW_TAB_HREFS.receipts}
          className="text-primary hover:underline"
        >
          Receipts
        </Link>
        .
      </p>
      <p className="text-sm text-muted-foreground">
        Salaries, supplier invoices and delivery commission are expenses too,
        but they are recorded in their own flows and are not listed here — so
        this is not your total spend. The{" "}
        <Link
          href="/reports/expense-register"
          className="text-primary hover:underline"
        >
          expense register
        </Link>{" "}
        shows every expense whatever recorded it, and ties to the P&amp;L.
      </p>
    </div>
  );
}
