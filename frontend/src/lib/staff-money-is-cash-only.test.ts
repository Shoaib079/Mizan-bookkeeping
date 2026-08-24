/** Manual staff money forms offer cash drawers, and default to the till.
 *
 * The owner, of the salary page: "pay from shows banks — it must not show bcz
 * bank paid salaries comes straight from bank transactions. and secondly it
 * shows home instead it must show main drawer in auto select".
 *
 * Both halves were the same oversight. `loadCashAccounts` already existed,
 * with "manual partner/staff bank moves use statement classify" written on it,
 * and the staff forms called `loadBankAndCashAccounts` anyway. The default
 * took `find(kind === "cash")` — the first cash account the API happened to
 * return, which was Home. `mainTillAccount` is the rule Count cash and Close
 * day already use: Main Drawer by name, never the home or safe drawer.
 *
 * Read structurally because the fault is which function a form calls, and per
 * file rather than as one sweep — five forms, and a sweep that stopped
 * matching would pass over all of them.
 */

import { describe, expect, it } from "vitest";

import { sourceAt } from "@/test-support/source";

/** Manual money entry. Each has a backend guard refusing a bank account. */
const MANUAL_STAFF_FORMS = [
  "components/forms/use-staff-salary-payment.ts",
  "components/forms/staff-cash-movement-form.tsx",
  "components/forms/staff-extra-days-form.tsx",
  "components/forms/staff-advance-return-form.tsx",
];

/** Corrections are not manual entry: correcting a payment that came off a bank
 * statement needs the bank account it was paid from, and the backend guard is
 * deliberately not applied there. */
const CORRECTION_FORMS = ["components/forms/correct-staff-ledger-form.tsx"];

describe("a manual staff money form", () => {
  it("loads cash drawers only", () => {
    for (const file of MANUAL_STAFF_FORMS) {
      const source = sourceAt(file);
      expect(source, file).toContain("loadCashAccounts");
      expect(source, file).not.toContain("loadBankAndCashAccounts");
    }
  });

  it("defaults to the counter till, not the first account returned", () => {
    // Extra days is the exception and says so: it defaults to accruing, and
    // auto-selecting a drawer there would record a payment nobody asked for.
    for (const file of MANUAL_STAFF_FORMS) {
      const source = sourceAt(file);
      if (source.includes("ACCRUE_VALUE")) continue;
      expect(source, file).toContain("mainTillAccount");
      expect(source, file).not.toMatch(/find\(\(a\) => a\.account_kind === "cash"\)/);
    }
  });
});

describe("a staff correction form", () => {
  it("still offers banks", () => {
    // Guard the guard: sweeping every staff form onto cash would break
    // correcting a salary that was paid from the bank and classified there.
    for (const file of CORRECTION_FORMS) {
      expect(sourceAt(file), file).toContain("loadBankAndCashAccounts");
    }
  });
});
