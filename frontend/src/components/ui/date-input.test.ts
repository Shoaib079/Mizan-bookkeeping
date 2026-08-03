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

  it("uses 16px input on mobile and viewport-aware calendar positioning", () => {
    expect(SOURCE).toContain("text-base touch-manipulation md:text-sm");
    expect(SOURCE).toContain("createPortal");
    expect(SOURCE).toContain("computeMobileCalendarStyle");
    expect(SOURCE).toContain("w-[min(17.5rem,100%)]");
  });
});
