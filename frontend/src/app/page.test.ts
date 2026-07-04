import { describe, expect, it } from "vitest";

async function readDashboardPage() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
  );
}

describe("dashboard recent entries", () => {
  it("places RecentEntriesCard below KPIs", async () => {
    const source = await readDashboardPage();
    expect(source).toContain("<RecentEntriesCard");
    const kpiGridEnd = source.indexOf("</div>", source.indexOf("kpis.map"));
    const cardPos = source.indexOf("<RecentEntriesCard");
    expect(kpiGridEnd).toBeGreaterThan(-1);
    expect(cardPos).toBeGreaterThan(kpiGridEnd);
  });
});

describe("dashboard shortcut buttons use one action source (UX-A)", () => {
  it("all three buttons use openQuickAction or openRecordAction, not Link", async () => {
    const source = await readDashboardPage();
    expect(source).toContain('openQuickAction("sales")');
    expect(source).toContain('openQuickAction("expense")');
    expect(source).toContain('openRecordAction("closeDay")');
    expect(source).not.toMatch(/href="\/close-day"/);
  });
});
