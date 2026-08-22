/** Group sale form note + copy helpers. */

import { describe, expect, it } from "vitest";

import {
  GROUP_SALE_DEFAULT_DESCRIPTION,
  groupSaleDescriptionForSubmit,
  groupSaleNoteFromSaved,
} from "@/lib/group-sale-form-copy";

describe("groupSaleNoteFromSaved", () => {
  it("maps default and blank stored descriptions to an empty note field", () => {
    expect(groupSaleNoteFromSaved("Group sale")).toBe("");
    expect(groupSaleNoteFromSaved("group sale")).toBe("");
    expect(groupSaleNoteFromSaved("   ")).toBe("");
    expect(groupSaleNoteFromSaved("deposit paid")).toBe("deposit paid");
  });
});

describe("groupSaleDescriptionForSubmit", () => {
  it("stores the default when the note is blank", () => {
    expect(groupSaleDescriptionForSubmit("")).toBe(GROUP_SALE_DEFAULT_DESCRIPTION);
    expect(groupSaleDescriptionForSubmit("   ")).toBe(GROUP_SALE_DEFAULT_DESCRIPTION);
    expect(groupSaleDescriptionForSubmit("deposit paid")).toBe("deposit paid");
  });
});
