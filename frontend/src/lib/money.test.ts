/** Unit tests — strict TRY parsing rejects garbage (CURSOR_RULES §1 rule 15). */

import { describe, expect, it } from "vitest";

import { moneyInputProblem, parseTryToKurus, sanitizeTryInput } from "./money";

describe("sanitizeTryInput", () => {
  it("strips letters from pasted garbage", () => {
    expect(sanitizeTryInput("12,3a")).toBe("12,3");
    expect(sanitizeTryInput("abc")).toBe("");
    expect(sanitizeTryInput("1.234,56 TL")).toBe("1.234,56");
  });

  it("keeps Turkish separators", () => {
    expect(sanitizeTryInput("1.500,25")).toBe("1.500,25");
  });
});

describe("parseTryToKurus", () => {
  it("parses comma decimal with thousands dots", () => {
    expect(parseTryToKurus("1.234,56")).toBe(123456);
    expect(parseTryToKurus("150,00")).toBe(15000);
    expect(parseTryToKurus("150")).toBe(15000);
    expect(parseTryToKurus("12,3")).toBe(1230);
  });

  it("parses dot decimal when fractional part is short", () => {
    expect(parseTryToKurus("150.50")).toBe(15050);
  });

  it("parses negative amounts", () => {
    expect(parseTryToKurus("-5,00")).toBe(-500);
  });

  it("rejects garbage instead of parseFloat corruption", () => {
    expect(parseTryToKurus("12,3a")).toBeNull();
    expect(parseTryToKurus("abc")).toBeNull();
    expect(parseTryToKurus("12abc34")).toBeNull();
  });

  it("returns null for empty or invalid shapes", () => {
    expect(parseTryToKurus("")).toBeNull();
    expect(parseTryToKurus("   ")).toBeNull();
    expect(parseTryToKurus(",")).toBeNull();
    expect(parseTryToKurus("1,234,56")).toBeNull();
  });
});

describe("moneyInputProblem", () => {
  it("says what is actually wrong with too many decimals", () => {
    // The old message was "Enter a valid amount (numbers only)" for every
    // rejection, so 15,66676 — which is numbers only — was told it was not.
    const problem = moneyInputProblem("15,66676");
    expect(problem?.message).toBe("Amounts are kept to two decimals.");
    // Rounded, not truncated: 15,66676 is nearer 15,67 than 15,66.
    expect(problem?.suggestion).toBe("15,67");
  });

  it("keeps the old message for input that really is not a number", () => {
    expect(moneyInputProblem("abc")?.message).toBe(
      "Enter a valid amount (numbers only).",
    );
    expect(moneyInputProblem("12abc")?.message).toBe(
      "Enter a valid amount (numbers only).",
    );
  });

  it("finds no problem with what the parser accepts", () => {
    for (const ok of ["15,67", "1.234,56", "500", "", "  "]) {
      expect(moneyInputProblem(ok), ok).toBeNull();
    }
  });

  it("rounds a half up rather than away", () => {
    expect(moneyInputProblem("1,005")?.suggestion).toBe("1,01");
    expect(moneyInputProblem("1,994")?.suggestion).toBe("1,99");
  });
});

describe("moneyInputProblem rounding edges", () => {
  it("carries into the whole part", () => {
    // 0,999 rounds to 1,00 — the carry must cross the comma, which a naive
    // string concat of whole and fraction would get wrong.
    expect(moneyInputProblem("0,999")?.suggestion).toBe("1,00");
    expect(moneyInputProblem("9,995")?.suggestion).toBe("10,00");
  });

  it("handles thousands separators in the whole part", () => {
    expect(moneyInputProblem("1.234,5678")?.suggestion).toBe("1234,57");
  });
});
