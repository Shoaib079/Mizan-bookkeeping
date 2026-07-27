import { describe, expect, it } from "vitest";

import {
  formatFxNative,
  formatFxNativeInput,
  parseFxNative,
} from "@/lib/fx-money";

describe("formatFxNativeInput → parseFxNative round-trip", () => {
  it("prefills a value the parser accepts back (the edit-forex bug)", () => {
    for (const minor of [100_050, 5_000, 1_234_567, 99]) {
      const text = formatFxNativeInput(minor);
      expect(text).not.toMatch(/[A-Za-z$€£₺]/);
      expect(parseFxNative(text)).toBe(minor);
    }
  });

  it("normalises a negative stored quantity to a positive input", () => {
    expect(parseFxNative(formatFxNativeInput(-100_050))).toBe(100_050);
  });
});

describe("parseFxNative tolerance", () => {
  it("accepts plain Turkish and plain dot formats", () => {
    expect(parseFxNative("1.000,50")).toBe(100_050);
    expect(parseFxNative("100.50")).toBe(10_050);
    expect(parseFxNative("100,50")).toBe(10_050);
  });

  it("ignores currency symbols and 3-letter codes", () => {
    expect(parseFxNative("$100.50")).toBe(10_050);
    expect(parseFxNative("€100,50")).toBe(10_050);
    expect(parseFxNative("100,50 USD")).toBe(10_050);
    expect(parseFxNative("USD 1.000,50")).toBe(100_050);
  });

  it("still rejects genuine nonsense", () => {
    expect(parseFxNative("")).toBeNull();
    expect(parseFxNative("abcd")).toBeNull();
    expect(parseFxNative("ten dollars")).toBeNull();
  });
});

describe("formatFxNative stays a display formatter", () => {
  it("keeps the currency symbol for read-only display", () => {
    expect(formatFxNative(100_050, "USD")).toMatch(/[$]/);
  });
});
