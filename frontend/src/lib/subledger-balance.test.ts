/** One sign rule, read by every subledger that has a balance.
 *
 * Staff and partners answer the same question — does this person owe the
 * business, or does the business owe them — and until now only partners said
 * so. Staff's headline was `max(0, owed − advance)`, which does not round a
 * negative to zero so much as delete it: an employee holding 1.000 of the
 * owner's money showed 0,00, and the amount he owed back appeared as a number
 * nowhere on the page.
 *
 * The fix was to give staff the partner wording. The risk in that fix is
 * writing it out a second time, which is exactly what happened to the edit and
 * void rules — twice, both times found by an owner rather than a test. So the
 * last check here reads the source.
 */

import { describe, expect, it } from "vitest";

import { balanceCaption, balanceHeading } from "@/lib/subledger-balance";
import { partnerBalanceHeading } from "@/lib/partner-balance";
import { staffBalanceHeading, staffNetPosition } from "@/lib/staff-net-position";
import { sourceDeclaring } from "@/test-support/source";

describe("balanceHeading", () => {
  it("names the direction, not just the size", () => {
    expect(balanceHeading(100, "partner")).toBe("You owe partner");
    expect(balanceHeading(-100, "partner")).toBe("Partner owes you");
    expect(balanceHeading(0, "partner")).toBe("Settled");
  });

  it("capitalises whoever it is handed", () => {
    expect(balanceHeading(-1, "employee")).toBe("Employee owes you");
  });
});

describe("balanceCaption", () => {
  it("says what to do about it", () => {
    expect(balanceCaption(1)).toMatch(/Pay this/);
    expect(balanceCaption(-1)).toMatch(/comes back to you/);
    expect(balanceCaption(0)).toMatch(/Nothing owed/);
  });
});

describe("both subledgers", () => {
  it("read the same direction the same way", () => {
    const heldByEmployee = staffNetPosition({
      balance_minor: -5_000,
      remaining_accrual_minor: 0,
      outstanding_advance_minor: 5_000,
    });
    expect(staffBalanceHeading(heldByEmployee)).toBe(
      "Employee holds your money",
    );
    expect(partnerBalanceHeading(-5_000)).toBe("Partner owes you");

    // And the other way, so a rule that always said "owes you" would fail.
    const owedToEmployee = staffNetPosition({
      balance_minor: 5_000,
      remaining_accrual_minor: 5_000,
      outstanding_advance_minor: 0,
    });
    expect(staffBalanceHeading(owedToEmployee)).toBe("You owe employee");
    expect(partnerBalanceHeading(5_000)).toBe("You owe partner");
  });

  it("keep no second copy of the partner/settled wording", () => {
    // Staff owns the advance-held negative label; positive/settled still
    // delegate so they cannot drift from partners.
    const partnerSrc = sourceDeclaring("partnerBalanceHeading");
    expect(partnerSrc).toContain("balanceHeading(");
    expect(partnerSrc).not.toContain("owes you\"");

    const staffSrc = sourceDeclaring("staffBalanceHeading");
    expect(staffSrc).toContain("balanceHeading(");
    expect(staffSrc).toContain("Employee holds your money");
  });
});
