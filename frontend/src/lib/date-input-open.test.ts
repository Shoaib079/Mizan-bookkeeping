/** DateInput opens on click only — not on programmatic focus (Slice 11.17 amend). */

import { describe, expect, it } from "vitest";

import {
  shouldOpenCalendarOnClick,
  shouldOpenCalendarOnFocus,
} from "./date-input-open";

describe("DateInput calendar open triggers", () => {
  it("does not open on focus (dialog auto-focus on first field)", () => {
    expect(shouldOpenCalendarOnFocus()).toBe(false);
  });

  it("opens on click when enabled", () => {
    expect(shouldOpenCalendarOnClick(false)).toBe(true);
  });

  it("does not open on click when disabled", () => {
    expect(shouldOpenCalendarOnClick(true)).toBe(false);
  });
});
