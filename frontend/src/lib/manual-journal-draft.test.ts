import { describe, expect, it } from "vitest";

import {
  draftProblems,
  draftToPayload,
  draftTotals,
  parseAmountToKurus,
  type DraftLine,
} from "@/lib/manual-journal-draft";

function line(
  accountId: string,
  side: "DEBIT" | "CREDIT",
  amountText: string,
): DraftLine {
  return { key: `${accountId}-${side}-${amountText}`, accountId, side, amountText };
}

describe("amounts", () => {
  it("read the same way as every other money field", () => {
    // Re-exported from lib/money on purpose — see the note there.
    expect(parseAmountToKurus("1.234,56")).toBe(123456);
    expect(parseAmountToKurus("110.752,10")).toBe(11075210);
    expect(parseAmountToKurus("500")).toBe(50000);
  });

  it("rejects what is not a number", () => {
    expect(parseAmountToKurus("")).toBeNull();
    expect(parseAmountToKurus("abc")).toBeNull();
  });

  it("parses a negative, which draftProblems then rejects", () => {
    // Caught where the message can say why, rather than silently read as null.
    expect(parseAmountToKurus("-5")).toBe(-500);
    expect(
      draftProblems(
        [line("a", "DEBIT", "-5"), line("b", "CREDIT", "-5")],
        "Negative",
      ),
    ).toContain("zero-amount");
  });
});

describe("draftTotals", () => {
  it("balances when debits equal credits", () => {
    const totals = draftTotals([
      line("a", "DEBIT", "110.752,10"),
      line("b", "CREDIT", "110.752,10"),
    ]);
    expect(totals.debitKurus).toBe(11075210);
    expect(totals.creditKurus).toBe(11075210);
    expect(totals.differenceKurus).toBe(0);
    expect(totals.balanced).toBe(true);
  });

  it("reports the difference so the form can show what is missing", () => {
    const totals = draftTotals([
      line("a", "DEBIT", "100"),
      line("b", "CREDIT", "60"),
    ]);
    expect(totals.differenceKurus).toBe(4000);
    expect(totals.balanced).toBe(false);
  });

  it("an empty draft is not balanced, even though 0 equals 0", () => {
    // Otherwise a blank form would look postable.
    expect(draftTotals([]).balanced).toBe(false);
  });

  it("ignores an unparseable amount rather than treating it as an error", () => {
    const totals = draftTotals([
      line("a", "DEBIT", "abc"),
      line("b", "CREDIT", "100"),
    ]);
    expect(totals.debitKurus).toBe(0);
    expect(totals.creditKurus).toBe(10000);
  });
});

describe("draftProblems", () => {
  const good = [
    line("a", "DEBIT", "110.752,10"),
    line("b", "CREDIT", "110.752,10"),
  ];

  it("finds nothing wrong with a balanced two-line entry", () => {
    expect(draftProblems(good, "Clear opening balance equity")).toEqual([]);
  });

  it("insists on a description — it is the audit trail", () => {
    expect(draftProblems(good, "   ")).toEqual(["no-description"]);
  });

  it("catches a line missing its account", () => {
    const problems = draftProblems(
      [line("", "DEBIT", "100"), line("b", "CREDIT", "100")],
      "Something",
    );
    expect(problems).toContain("incomplete-line");
  });

  it("catches an unbalanced entry", () => {
    const problems = draftProblems(
      [line("a", "DEBIT", "100"), line("b", "CREDIT", "60")],
      "Something",
    );
    expect(problems).toContain("unbalanced");
  });

  it("needs at least two lines", () => {
    expect(draftProblems([line("a", "DEBIT", "100")], "x")).toContain(
      "no-lines",
    );
  });
});

describe("draftToPayload", () => {
  it("builds what the API expects", () => {
    const payload = draftToPayload(
      [
        line("acc-3900", "DEBIT", "110.752,10"),
        line("acc-3300", "CREDIT", "110.752,10"),
      ],
      "  Clear opening balance equity to partner capital  ",
      "2026-08-04",
    );

    expect(payload).toEqual({
      entry_date: "2026-08-04",
      description: "Clear opening balance equity to partner capital",
      lines: [
        { account_id: "acc-3900", amount_kurus: 11075210, side: "debit" },
        { account_id: "acc-3300", amount_kurus: 11075210, side: "credit" },
      ],
      cash_flow_category: "operating",
    });
  });

  it("sends the side lowercase, as the API's enum defines it", () => {
    // This assertion previously read "DEBIT", which is what the form was
    // sending — and `PostingLineIn.side` is an AccountNormalBalance whose
    // members are "debit"/"credit". Pydantic matches enums by value, so every
    // post came back 422. The test agreed with the bug because it only ever
    // checked the payload against itself.
    const payload = draftToPayload(
      [line("a", "DEBIT", "100"), line("b", "CREDIT", "100")],
      "Lowercase sides",
      "2026-08-04",
    );
    expect(payload?.lines.map((l) => l.side)).toEqual(["debit", "credit"]);
  });

  it("refuses to build a payload from a draft that cannot post", () => {
    expect(
      draftToPayload(
        [line("a", "DEBIT", "100"), line("b", "CREDIT", "60")],
        "Unbalanced",
        "2026-08-04",
      ),
    ).toBeNull();
  });
});

describe("payload extras", () => {
  const good = [
    line("acc-3900", "DEBIT", "110.752,10"),
    line("acc-3300", "CREDIT", "110.752,10"),
  ];

  it("always states a cash flow category rather than letting the API guess", () => {
    // Omitted, the API treats it as operating — right for most corrections but
    // wrong for a loan repayment or equipment purchase, and silently so.
    const payload = draftToPayload(good, "Clear opening equity", "2026-08-04");
    expect(payload?.cash_flow_category).toBe("operating");

    const financing = draftToPayload(good, "Loan repayment", "2026-08-04", {
      cashFlowCategory: "financing",
    });
    expect(financing?.cash_flow_category).toBe("financing");
  });

  it("omits the unlock reason unless one was given", () => {
    // Sending an empty reason would look like an unlock request for a month
    // that is not even closed.
    const payload = draftToPayload(good, "Something", "2026-08-04", {
      cashFlowCategory: "operating",
      periodUnlockReason: "   ",
    });
    expect(payload).not.toHaveProperty("period_unlock_reason");
  });

  it("passes a reason through, trimmed", () => {
    const payload = draftToPayload(good, "Something", "2026-08-04", {
      cashFlowCategory: "operating",
      periodUnlockReason: "  Accountant asked after close  ",
    });
    expect(payload?.period_unlock_reason).toBe("Accountant asked after close");
  });
});
