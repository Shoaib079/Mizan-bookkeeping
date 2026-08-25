/**
 * One component per job. Filename uniqueness is the cheap check; same-job
 * families catch the real drift (two KPI cards, two headline figures, …).
 *
 * Adapted from the owner starter — keep the basename check, add job families.
 */

import { describe, expect, it } from "vitest";

import { sourceFiles } from "@/test-support/source";

type JobFamily = {
  job: string;
  /** Basenames that are allowed to own this job. */
  allowed: string[];
  /** Other basenames that look like the same job. */
  suspect: RegExp;
};

/** Jobs that must not spawn a parallel component. */
const JOB_FAMILIES: JobFamily[] = [
  {
    job: "period / report KPI figure card",
    allowed: ["stat-card"],
    // SalesPostedKpiCards is a composer of StatCard, not a second card shell.
    suspect: /(?:^|-)(?:kpi-card|stat-tile|metric-card|figure-card)(?:\.|$)/i,
  },
  {
    job: "page headline money figure",
    allowed: ["summary-panel"], // HeadlineFigure lives here
    suspect: /(?:^|-)(?:headline-figure|hero-figure|amount-hero)(?:\.|$)/i,
  },
  {
    job: "tinted Lucide icon square",
    allowed: ["icon-square"],
    suspect: /(?:^|-)(?:icon-chip|tinted-icon|icon-badge)(?:\.|$)/i,
  },
  {
    job: "meaning-card left accent bar",
    allowed: ["meaning-card"],
    suspect: /(?:^|-)(?:accent-bar|meaning-bar)(?:\.|$)/i,
  },
];

function componentFiles(): { path: string; basename: string }[] {
  return sourceFiles()
    .filter(
      (f) =>
        f.path.startsWith("components/") &&
        f.path.endsWith(".tsx") &&
        !f.path.includes(".test.") &&
        !f.path.startsWith("components/preview/"),
    )
    .map((f) => ({
      path: f.path,
      basename: f.path.split("/").pop()!.replace(/\.tsx$/, ""),
    }));
}

describe("no duplicate components", () => {
  it("no two component files share the same basename", () => {
    const files = componentFiles();
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const file of files) {
      const prior = seen.get(file.basename);
      if (prior) {
        duplicates.push(`${file.basename}: ${prior} and ${file.path}`);
      } else {
        seen.set(file.basename, file.path);
      }
    }

    expect(duplicates, duplicates.join("\n")).toEqual([]);
  });

  it("known UI jobs stay on one canonical component", () => {
    const files = componentFiles();
    const collisions: string[] = [];

    for (const family of JOB_FAMILIES) {
      for (const file of files) {
        if (family.allowed.includes(file.basename)) continue;
        if (!family.suspect.test(file.basename)) continue;
        collisions.push(
          `${family.job}: ${file.path} looks like a parallel of [${family.allowed.join(", ")}]`,
        );
      }
    }

    expect(collisions, collisions.join("\n")).toEqual([]);
  });

  it("CashBankSnapshotCard stays a documented StatCard sibling, not a second KPI shell", () => {
    // Same visual family as StatCard (accepted-live), but owns cash/bank drill-down.
    // If a third "cash KPI card" appears under another name, flag it here.
    const siblings = componentFiles().filter((f) =>
      /cash.*(?:kpi|stat|snapshot|tile).*card|card.*cash.*(?:kpi|stat|snapshot)/i.test(
        f.basename,
      ),
    );
    const allowed = new Set(["cash-bank-snapshot-card"]);
    const extras = siblings.filter((f) => !allowed.has(f.basename));
    expect(
      extras.map((f) => f.path),
      "extra cash KPI card shells — reuse CashBankSnapshotCard or StatCard",
    ).toEqual([]);
  });
});
