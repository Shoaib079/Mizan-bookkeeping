import { describe, expect, it } from "vitest";

async function readRecordPage() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
  );
}

describe("Add page recording desk", () => {
  it("uses the amount-first desk with recorded today inside it", async () => {
    const source = await readRecordPage();
    expect(source).toContain("<RecordDesk");
    expect(source).not.toContain("<RecordHub");
    expect(source).not.toContain("<RecordedTodayCard");
  });
});
