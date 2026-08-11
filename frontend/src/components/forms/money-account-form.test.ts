import { describe, expect, it } from "vitest";

import { codeOnly, sourceDeclaring } from "@/test-support/source";

/** A bank account is named after its bank.
 *
 * The New bank account dialog asked for a Name and a Bank name, and for a bank
 * those are the same words. People typed them twice, and the accounts list then
 * printed them twice — once as the row title and again as the subtitle beneath
 * it, because that subtitle only hides itself when the two strings match.
 *
 * Cards are deliberately not folded in. The issuer is "Garanti" and the
 * account is "Garanti Bonus ···1234"; you can hold two cards from one issuer,
 * and collapsing them would make the second impossible to name. Cash drawers
 * and FX wallets have no bank at all.
 */
const form = () => codeOnly(sourceDeclaring("MoneyAccountForm"));

describe("the New bank account dialog", () => {
  it("asks for the bank once, and sends it as the account's name", () => {
    expect(form()).toContain('const nameIsTheBank = effectiveKind === "bank"');
    expect(form()).toContain("const accountName = nameIsTheBank ? bankName : name");
    expect(form()).toContain("name: accountName");
  });

  it("hides the Name field only for banks", () => {
    // A cash drawer or an FX wallet has no bank name to fall back on, so
    // hiding Name for them would leave nothing to submit.
    expect(form()).toContain("{!nameIsTheBank && (");
    expect(form()).toContain('effectiveKind === "credit_card" ? "Issuer" : "Bank name"');
  });

  it("requires the bank name once it is the only field", () => {
    // Name carried `required` before. Dropping the field without moving the
    // requirement would let an unnamed account through to a NOT NULL column.
    expect(form()).toContain("required={nameIsTheBank}");
  });

  it("warns that two accounts at one bank need telling apart", () => {
    // `name` is unique per restaurant, so the second VAKIF BANK is refused by
    // the API. Better said before than discovered on submit.
    expect(form()).toMatch(/same bank need telling apart/);
  });
});

describe("an account is not labelled with the same words twice", () => {
  it("the list hides the subtitle when it equals the title", () => {
    const rows = codeOnly(sourceDeclaring("BankAccountBalanceRows"));
    expect(rows).toContain("account.bank_name !== account.name");
  });

  it("the detail page hides the meta fact when it equals the title", () => {
    // This one did not have the rule, so a bank account created through the
    // new dialog would have shown its name as the heading and again in the
    // meta row underneath.
    const detail = codeOnly(sourceDeclaring("AccountDetailPageContent"));
    expect(detail).toContain("account.bank_name !== account.name");
  });
});
