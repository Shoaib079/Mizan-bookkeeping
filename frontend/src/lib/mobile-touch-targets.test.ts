import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

import { MOBILE_SHELL_MAX_WIDTH_PX, MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";

/** 44px is the hit area iOS and Android both ask for. The app's buttons are
 * h-9 (36px), and dense rows drop them to h-8 (32px) — including Void and Edit
 * on ledger rows, where a mis-tap costs a journal entry. */


describe("mobile touch targets", () => {
  it("Button raises its hit area on phones", () => {
    const button = sourceDeclaring("Button");
    expect(button).toContain("MOBILE_TOUCH_TARGET");
    // Applied, not merely imported.
    expect(button).toMatch(/MOBILE_TOUCH_TARGET,/);
  });

  it("the token's breakpoint matches the shell's", () => {
    // Tailwind needs the literal 819 and cannot read the constant, so the two
    // can drift silently — the class would simply stop matching the breakpoint
    // the rest of the app uses.
    const px = MOBILE_TOUCH_TARGET.match(/max-\[(\d+)px\]/)?.[1];
    expect(px).toBeDefined();
    expect(Number(px)).toBe(MOBILE_SHELL_MAX_WIDTH_PX);
  });

  it("asks for at least 44px", () => {
    // min-h-11 is 2.75rem = 44px.
    expect(MOBILE_TOUCH_TARGET).toContain("min-h-11");
  });

  it("uses min-height so desktop row rhythm is untouched", () => {
    // Callers set h-8 for dense desktop rows. min-height only wins where it is
    // larger, so this cannot make a desktop button taller.
    expect(MOBILE_TOUCH_TARGET).toContain("min-h-");
    expect(MOBILE_TOUCH_TARGET).not.toMatch(/(^|:)h-\d/);
  });

  it("the calendar's month arrows are not smaller on mobile than on desktop", () => {
    // They were h-7 (28px) on mobile against h-8 on desktop — smaller on the
    // one device driven by thumbs.
    const dateInput = sourceDeclaring("DateInput");
    expect(dateInput).not.toContain('isMobile ? "h-7 w-7" : "h-8 w-8"');
    expect(dateInput).toContain('isMobile ? "h-11 w-11" : "h-8 w-8"');
  });
});

describe("dropdowns stay on screen", () => {
  /** `absolute right-0` anchors a menu's right edge to its trigger's, so the
   * menu extends left by its own width. That is correct when the trigger sits
   * at the far right of a desktop header. On a phone the action rows wrap and
   * the trigger lands on the left, so a 13rem menu opened 110px off the edge —
   * visible only as a sliver, which is how it looked empty. */
  const MENUS = [
    "OverflowMenu",
    // Was three separate entries — the subledger, report and delivery download
    // menus each owned a copy of the dropdown. They share `DownloadMenu` now,
    // so this list shrank because the duplication went, not because the rule
    // was loosened.
    "DownloadMenu",
    "MonthPackButton",
  ];

  it("opens rightward on a phone and rightward-anchored above it", () => {
    for (const file of MENUS) {
      const s = sourceDeclaring(file);
      expect(s, `${file} still anchors right on mobile`).not.toMatch(
        /absolute right-0 z-\d/,
      );
      expect(s, `${file} has no desktop anchor`).toContain("sm:right-0");
    }
  });

  it("never exceeds the viewport width", () => {
    // Belt and braces: even anchored left, a wide menu on a narrow phone
    // would run off the other edge.
    for (const file of MENUS.filter((f) => f !== "OverflowMenu")) {
      expect(sourceDeclaring(file), file).toContain("max-w-[calc(100vw-1.75rem)]");
    }
  });

  it("gives the items in them a thumb-sized row", () => {
    /* This is the gap that let the defect sit there.
     *
     * The two checks above ask where a menu opens. Neither asks how tall its
     * rows are — so `MOBILE_TOUCH_TARGET` was on the subledger menu's items
     * and on neither of the other two, and all three passed. A menu that opens
     * in the right place and cannot be tapped is not a menu that works. */
    for (const file of MENUS) {
      const s = sourceDeclaring(file);
      expect(s, `${file}'s items are not thumb-sized`).toContain(
        "MOBILE_TOUCH_TARGET",
      );
    }
  });
});
