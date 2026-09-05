import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

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
    const dateInput = sourceDeclaringAll("DateInput", "DateInputCalendar");
    expect(dateInput).not.toContain('isMobile ? "h-7 w-7" : "h-8 w-8"');
    expect(dateInput).toContain('isMobile ? "h-11 w-11" : "h-8 w-8"');
  });
});

describe("dropdowns stay on screen", () => {
  /** Menus measure the trigger and pick left vs right so a panel never
   * forces horizontal page scroll — whether the trigger sits on the right
   * edge (header "…") or wrapped onto the left. */
  const MENUS = [
    "OverflowMenu",
    "DownloadMenu",
    "MonthPackButton",
  ];

  it("uses shared viewport align + width clamp", () => {
    for (const file of MENUS) {
      const s = sourceDeclaring(file);
      expect(s, `${file} missing align helper`).toContain("useDropdownHAlign");
      expect(s, `${file} missing align class`).toContain("dropdownHAlignClass");
      expect(s, `${file} missing width clamp`).toContain("DROPDOWN_VIEWPORT_MAX_W");
      expect(s, `${file} still hard-codes sm:right-0`).not.toContain("sm:right-0");
    }
  });

  it("never exceeds the viewport width (token)", () => {
    const alignSrc = sourceAt("lib/dropdown-align.ts");
    expect(alignSrc).toContain("DROPDOWN_VIEWPORT_MAX_W");
    expect(alignSrc).toContain("max-w-[calc(100vw-1.75rem)]");
    expect(alignSrc).toContain("viewportWidth");
  });

  it("gives the items in them a thumb-sized row", () => {
    for (const file of MENUS) {
      const s = sourceDeclaring(file);
      expect(s, `${file}'s items are not thumb-sized`).toContain(
        "MOBILE_TOUCH_TARGET",
      );
    }
  });
});
