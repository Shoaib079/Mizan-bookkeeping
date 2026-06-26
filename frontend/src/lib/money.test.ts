/** Unit tests — strict TRY parsing rejects garbage (CURSOR_RULES §1 rule 15). */

import { describe, expect, it } from "vitest";

import { parseTryToKurus, sanitizeTryInput } from "./money";

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
