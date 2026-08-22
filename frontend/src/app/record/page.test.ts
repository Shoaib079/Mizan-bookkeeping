import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("Add page recording desk", () => {
  it("uses the amount-first desk (recent list lives inside RecordDesk)", () => {
    const source = sourceDeclaring("RecordPage");
    expect(source).toContain("<RecordDesk");
    expect(source).not.toContain("<RecordHub");
    expect(source).not.toContain("<RecordedTodayCard");
    expect(source).not.toContain("<RecentlyRecordedCard");
  });
});
