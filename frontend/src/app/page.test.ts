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
