import { describe, expect, it } from "vitest";

import {
  DROPDOWN_VIEWPORT_MAX_W,
  dropdownHAlignClass,
  dropdownHAlignFromRect,
} from "@/lib/dropdown-align";

describe("dropdownHAlignFromRect", () => {
  it("opens leftward when the trigger sits on the right edge", () => {
    // Phone: "…" at ~360px in a 390px viewport, 13rem menu.
    expect(
      dropdownHAlignFromRect({ left: 340, right: 376 }, 390, 208),
    ).toBe("right");
  });

  it("opens rightward when the trigger wraps to the left", () => {
    expect(
      dropdownHAlignFromRect({ left: 14, right: 50 }, 390, 208),
    ).toBe("left");
  });

  it("picks the side with more room when neither fits", () => {
    expect(
      dropdownHAlignFromRect({ left: 40, right: 80 }, 200, 208),
    ).toBe("left");
    expect(
      dropdownHAlignFromRect({ left: 120, right: 160 }, 200, 208),
    ).toBe("right");
  });
});

describe("dropdown panel classes", () => {
  it("maps align to absolute edges and clamps width", () => {
    expect(dropdownHAlignClass("right")).toContain("right-0");
    expect(dropdownHAlignClass("left")).toContain("left-0");
    expect(DROPDOWN_VIEWPORT_MAX_W).toContain("100vw");
  });
});
