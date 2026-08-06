import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Warn about an overpayment; never refuse it.
 *
 * There are two ways to record a customer receipt, and only one is checked.
 * When a native amount is sent on its own, the API runs
 * `compute_try_payment_from_native`, which rejects anything larger than the
 * outstanding balance. When a lira amount is sent alongside it, the service
 * returns before that function is reached, and the native quantity is stored
 * exactly as typed. India Gate has 922 USD recorded against 624 USD of sales
 * because of it.
 *
 * The lira ledger is unaffected either way, so this is not a correctness bug
 * to be fixed by blocking — a customer really can pay a deposit. It is a
 * missing sentence. The two things worth holding still are that the sentence
 * appears, and that it never becomes a barrier.
 */

const SOURCE = readFileSync(
  new URL("./customer-payment-form.tsx", import.meta.url),
  "utf8",
);

/** Source with comments removed — the rules below are about behaviour, and
 * the prose explaining them names the very things being forbidden. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the overpayment warning", () => {
  it("exists at all", () => {
    expect(CODE).toContain("paysAhead");
    expect(CODE).toMatch(/paid\s*\n?\s*ahead/);
  });

  it("compares against what is outstanding in the wallet's own currency", () => {
    // Not the lira balance, and not another currency the customer also owes
    // in. An agency owing USD and EUR must be judged on the one being paid.
    expect(CODE).toContain("outstandingInWalletCurrency");
    expect(CODE).toMatch(
      /row\.currency === selectedAccount\?\.currency/,
    );
  });

  it("only fires on the path the API does not check", () => {
    // The native-only path is already guarded server-side and blocks in the
    // form. Warning there too would be a second voice saying the same thing.
    expect(CODE).toMatch(/paysAhead =\s*\n?\s*!nativeOnlyPayment/);
  });

  it("does not block submission", () => {
    const blocked = CODE.match(/const submitBlocked =[\s\S]*?;\n/)?.[0];
    expect(blocked, "submitBlocked not found").toBeTruthy();
    expect(
      blocked,
      "the warning became a barrier — overpaying is allowed",
    ).not.toContain("paysAhead");
  });

  it("does not gate the submit button either", () => {
    const button = CODE.match(/<Button type="submit"[\s\S]*?>/)?.[0];
    expect(button, "submit button not found").toBeTruthy();
    expect(button).not.toContain("paysAhead");
  });

  it("is styled as a warning, not as an error", () => {
    // Red reads as "you have done something wrong". This is a question, not
    // a verdict.
    const warning = CODE.match(/\{paysAhead &&[\s\S]*?\)\}/)?.[0];
    expect(warning, "warning block not found").toBeTruthy();
    expect(warning).toContain("warning");
    expect(warning).not.toContain("text-destructive");
  });
});
