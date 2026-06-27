/** Entity visual helpers — Slice 12.0b. */

import { describe, expect, it } from "vitest";

import {
  entityAccentColor,
  entityInitial,
  userInitials,
} from "./entity-visual";

describe("entityAccentColor", () => {
  it("returns a stable palette colour per entity id", () => {
    const a = entityAccentColor("entity-aaa");
    const b = entityAccentColor("entity-aaa");
    const c = entityAccentColor("entity-bbb");
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("entityInitial", () => {
  it("uses first letters of first two words", () => {
    expect(entityInitial("Bodrum Bistro")).toBe("BB");
  });

  it("uses first two characters for a single word", () => {
    expect(entityInitial("Mizan")).toBe("MI");
  });
});

describe("userInitials", () => {
  it("prefers display name over email", () => {
    expect(userInitials("Ali Veli", "ali@example.com")).toBe("AV");
  });

  it("falls back to email local part", () => {
    expect(userInitials("", "ali@example.com")).toBe("AL");
  });
});
