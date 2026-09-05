/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  CALENDAR_BELOW_GAP_PX,
  computeMobileCalendarStyle,
} from "@/components/ui/date-input-layout";
import { sourceDeclaring } from "@/test-support/source";

describe("computeMobileCalendarStyle", () => {
  it("anchors below the field, never flips above", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 700,
    });
    const anchor = {
      left: 16,
      right: 200,
      top: 400,
      bottom: 436,
      width: 184,
      height: 36,
      x: 16,
      y: 400,
      toJSON() {
        return this;
      },
    } as DOMRect;

    const style = computeMobileCalendarStyle(anchor);
    expect(style.position).toBe("fixed");
    expect(style.top).toBe(436 + CALENDAR_BELOW_GAP_PX);
    expect(style.maxHeight).toBeTypeOf("number");
    expect(Number(style.maxHeight)).toBeLessThanOrEqual(
      700 - 8 - (436 + CALENDAR_BELOW_GAP_PX),
    );
    // Must not place the panel above the field.
    expect(Number(style.top)).toBeGreaterThanOrEqual(anchor.bottom);
  });

  it("still stays below when space under the field is tight", () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });
    const anchor = {
      left: 16,
      right: 200,
      top: 420,
      bottom: 456,
      width: 184,
      height: 36,
      x: 16,
      y: 420,
      toJSON() {
        return this;
      },
    } as DOMRect;

    const style = computeMobileCalendarStyle(anchor);
    expect(Number(style.top)).toBe(456 + CALENDAR_BELOW_GAP_PX);
    expect(Number(style.maxHeight)).toBeLessThan(340);
    expect(style.overflowY).toBe("auto");
  });
});

describe("DateInput mobile pick-only", () => {
  it("phone field is read-only so the keypad does not open", () => {
    const src = sourceDeclaring("DateInput");
    expect(src).toContain("readOnly={isMobile}");
    expect(src).toContain('inputMode={isMobile ? "none" : "numeric"}');
    expect(src).toContain("caret-transparent");
  });
});
