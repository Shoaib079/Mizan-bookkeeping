import { describe, expect, it } from "vitest";

import { monthOverMonthTrend } from "@/lib/month-over-month-trend";

describe("monthOverMonthTrend", () => {
  it("flat when equal", () => {
    expect(monthOverMonthTrend(100, 100)).toEqual({
      value: "0%",
      direction: "flat",
    });
  });

  it("up when current higher", () => {
    expect(monthOverMonthTrend(120, 100)).toEqual({
      value: "+20%",
      direction: "up",
    });
  });

  it("down when current lower", () => {
    expect(monthOverMonthTrend(80, 100)).toEqual({
      value: "-20%",
      direction: "down",
    });
  });

  it("New when prior is zero and current positive", () => {
    expect(monthOverMonthTrend(50, 0)).toEqual({
      value: "New",
      direction: "up",
    });
  });
});
