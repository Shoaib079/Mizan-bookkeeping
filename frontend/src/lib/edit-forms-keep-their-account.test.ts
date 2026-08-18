/** A correction form with an account picker must be told which account.
 *
 * The owner, of an Edit opened on a staff payment: *"when i click on edit it
 * forgets where that money came from or from where it was paid. it must not
 * that can cause issues"*.
 *
 * The issue is not the forgetting. Every one of these forms falls back to the
 * **first** wallet in the list:
 *
 *     const chosen =
 *       (recorded.payment_account_id && merged.find(...)) || merged[0];
 *
 * So a dropped account does not reopen empty — it reopens filled in, with the
 * wrong drawer, and saving reposts the money there. Nothing on screen says a
 * thing. That is why this is a guard and not just a fix: the failure is silent
 * by construction, so only an enumeration finds it.
 *
 * And it had to be found four times over. `_partner_ledger_context` was given
 * the account, and carried a docstring saying "read once here, so both are
 * right"; customer, supplier and staff were never added. The staff one only
 * surfaced when that page stopped passing the ledger row itself and started
 * taking the backend's context, like the General ledger always had — so the
 * General ledger had been quietly rewriting the account all along.
 *
 * Two halves, because either alone leaves the hole open: the backend context
 * has to supply the key, and `editTargetFor` has to carry it through.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Edit kinds whose form takes an account and restores it from the entry. */
const KINDS_WITH_A_PICKER = [
  "partner_ledger",
  "staff_ledger",
  "customer_payment",
  "supplier_payment",
] as const;

/** …and the backend context function behind each. */
const CONTEXT_FN: Record<string, string> = {
  partner_ledger: "_partner_ledger_context",
  staff_ledger: "_staff_ledger_context",
  customer_payment: "_customer_payment_context",
  supplier_payment: "_supplier_row_context",
};

const target = sourceDeclaring("editTargetFor");
const contexts = readFileSync(
  join(process.cwd(), "..", "backend", "app", "core", "ledger", "entry_contexts.py"),
  "utf8",
);

/** The body of one `case "<kind>":` arm, up to the next `case`. */
function arm(kind: string): string {
  const start = target.indexOf(`case "${kind}":`);
  if (start === -1) return "";
  const next = target.indexOf('case "', start + 1);
  return target.slice(start, next === -1 ? undefined : next);
}

/** The body of one context function, up to the next top-level `def`. */
function contextBody(name: string): string {
  const start = contexts.indexOf(`def ${name}(`);
  if (start === -1) return "";
  const next = contexts.indexOf("\ndef ", start + 1);
  return contexts.slice(start, next === -1 ? undefined : next);
}

describe("the source these read", () => {
  it("is there, and every arm and context is found by name", () => {
    // Guard the guard. `arm()` returning "" for a renamed kind would make the
    // assertions below pass over nothing — the same vacuous-check shape that
    // let three of these four stay wrong for months.
    expect(contexts.length).toBeGreaterThan(1000);
    for (const kind of KINDS_WITH_A_PICKER) {
      expect(arm(kind), `no case "${kind}" in editTargetFor`).not.toBe("");
      expect(
        contextBody(CONTEXT_FN[kind]),
        `no ${CONTEXT_FN[kind]} in entry_contexts.py`,
      ).not.toBe("");
    }
  });
});

describe("an edit target for a form with an account picker", () => {
  it("carries the account through", () => {
    const missing = KINDS_WITH_A_PICKER.filter(
      (kind) => !arm(kind).includes("payment_account_id"),
    );
    expect(
      missing,
      "these open a form that will silently pick the first wallet instead",
    ).toEqual([]);
  });

  it("is given one by the backend context behind it", () => {
    const missing = KINDS_WITH_A_PICKER.filter(
      (kind) => !contextBody(CONTEXT_FN[kind]).includes("payment_account_id"),
    );
    expect(
      missing,
      "the frontend reads a key the backend never sends — add " +
        "_money_account_id(session, entry) to these contexts",
    ).toEqual([]);
  });
});
