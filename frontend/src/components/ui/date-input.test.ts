import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

const SOURCE = sourceDeclaringAll(
  "DateInput",
  "DateInputCalendar",
  "computeMobileCalendarStyle",
  "viewFromValue",
);

describe("DateInput future dates", () => {
  it("disables future days by default for posting forms", () => {
    expect(SOURCE).toContain("disableFuture = true");
    expect(SOURCE).toContain("isFutureDay");
    expect(SOURCE).toContain("canGoNextMonth");
    expect(SOURCE).toContain("clampTypedValue");
    expect(SOURCE).toMatch(/if \(open \|\| !today\) return/);
    expect(SOURCE).toContain("setToday(startOfDay(new Date()))");
    expect(SOURCE).toContain("open && today");
  });

  it("uses separate mobile portal sizing and fixed desktop calendar width", () => {
    expect(SOURCE).toContain("text-base touch-manipulation md:text-sm");
    expect(SOURCE).toContain("createPortal");
    expect(SOURCE).toContain("computeMobileCalendarStyle");
    expect(SOURCE).toContain('isMobile ? "p-3" : "w-[17.5rem] p-4"');
    expect(SOURCE).toContain("isMobile={isMobile}");
    expect(SOURCE).toContain("readOnly={isMobile}");
    expect(SOURCE).toContain("overflowY: \"auto\"");
  });

  it("keeps the calendar icon anchored to the input when the late-night hint shows", () => {
    const hintIdx = SOURCE.indexOf("{lateNightHint &&");
    const inputWrapIdx = SOURCE.indexOf('<div className="relative">');
    expect(inputWrapIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(inputWrapIdx);
    expect(SOURCE).toContain("!isMobile && calendarPanel");
  });
});

describe("DateInput split", () => {
  it("composes calendar + layout helpers (not a monolith)", () => {
    const field = sourceDeclaring("DateInput");
    expect(field).toContain("DateInputCalendar");
    expect(field).toContain("computeMobileCalendarStyle");
    expect(field).toContain("useDismissOnOutsideClick");
  });
});
