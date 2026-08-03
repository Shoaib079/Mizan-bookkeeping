import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(__dirname, "date-input.tsx"), "utf8");

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
  });
});
