/** The dashboard chart refreshes underneath its own bars.
 *
 * The owner, after the page archetypes stopped blanking: "the dashboard still
 * does it kinda blink". The page frame was fixed; the chart was not. Its
 * status was reset to "loading" at the top of every reload, so each background
 * refresh — window focus, or anything recorded — swapped the bars for a
 * skeleton and back.
 *
 * The other cards on that page were already fine, which is why only this one
 * still showed: the KPI figures are never nulled on refresh, and the cash/bank
 * and balances cards only fetch when the restaurant changes.
 */

import { describe, expect, it } from "vitest";

import { chartStatusForRefresh } from "@/components/dashboard/weekly-chart";

describe("a chart that already has bars", () => {
  it("keeps them while it refreshes", () => {
    expect(chartStatusForRefresh("loaded")).toBe("loaded");
  });
});

describe("a chart with nothing on it", () => {
  it("shows the skeleton on a first load", () => {
    expect(chartStatusForRefresh("loading")).toBe("loading");
  });

  it("shows it again after a failure, rather than keeping the error up", () => {
    // Nothing on screen to preserve, and a retry still reading "couldn't load
    // trend data" would be reporting a failure that is no longer happening.
    expect(chartStatusForRefresh("error")).toBe("loading");
  });
});
