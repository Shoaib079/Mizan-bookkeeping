import { describe, expect, it } from "vitest";

import { isValidVkn, normalizeVknInput, vknValidationMessage } from "./vkn";

describe("vkn", () => {
  it("normalizes whitespace", () => {
    expect(normalizeVknInput(" 1234567890 ")).toBe("1234567890");
  });

  it("accepts 10 and 11 digit VKN", () => {
    expect(isValidVkn("1234567890")).toBe(true);
    expect(isValidVkn("12345678901")).toBe(true);
  });

  it("rejects invalid VKN", () => {
    expect(vknValidationMessage("")).toMatch(/required/i);
    expect(vknValidationMessage("123")).toMatch(/10 or 11 digits/i);
  });
});
