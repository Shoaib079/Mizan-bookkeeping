import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MOBILE_SHELL_MAX_WIDTH_PX, MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";

/** 44px is the hit area iOS and Android both ask for. The app's buttons are
 * h-9 (36px), and dense rows drop them to h-8 (32px) — including Void and Edit
 * on ledger rows, where a mis-tap costs a journal entry. */

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("mobile touch targets", () => {
  it("Button raises its hit area on phones", () => {
    const button = source("components/ui/button.tsx");
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
    const dateInput = source("components/ui/date-input.tsx");
    expect(dateInput).not.toContain('isMobile ? "h-7 w-7" : "h-8 w-8"');
    expect(dateInput).toContain('isMobile ? "h-11 w-11" : "h-8 w-8"');
  });
});
