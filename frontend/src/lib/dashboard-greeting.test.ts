import { describe, expect, it } from "vitest";

import {
  dashboardGreetingLine,
  timeOfDayGreeting,
} from "@/lib/dashboard-greeting";

describe("dashboardGreetingLine", () => {
  it("morning / afternoon / evening by local hour", () => {
    expect(timeOfDayGreeting(new Date(2026, 7, 23, 8, 0, 0))).toBe(
      "Good morning",
    );
    expect(timeOfDayGreeting(new Date(2026, 7, 23, 14, 0, 0))).toBe(
      "Good afternoon",
    );
    expect(timeOfDayGreeting(new Date(2026, 7, 23, 19, 0, 0))).toBe(
      "Good evening",
    );
  });

  it("includes display name with a comma when present", () => {
    expect(
      dashboardGreetingLine("Ada", new Date(2026, 7, 23, 9, 0, 0)),
    ).toBe("Good morning, Ada");
  });

  it("omits the comma part when name is missing or blank", () => {
    expect(dashboardGreetingLine(null, new Date(2026, 7, 23, 9, 0, 0))).toBe(
      "Good morning",
    );
    expect(dashboardGreetingLine("  ", new Date(2026, 7, 23, 9, 0, 0))).toBe(
      "Good morning",
    );
  });
});
