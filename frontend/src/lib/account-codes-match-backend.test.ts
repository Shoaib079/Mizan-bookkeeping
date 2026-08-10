/** Every account code the frontend names exists in the backend's chart.
 *
 * The codes are the backend's. `default_chart.py` seeds them; the frontend
 * refers to a handful by number to pick a default, hide an account from a
 * picker, or find one on a report. Nothing connected the two, so a code could
 * be wrong and stay wrong — which one was.
 *
 * `NON_MANUAL_REVENUE_CODES` listed `4400` to keep FX Gain out of the manual
 * cash-in picker. There is no 4400 in the chart; FX Gain is 4200. So the
 * account the comment named was on offer, and choosing it would credit a
 * currency gain by hand against the flow that already posts one. A filter
 * excluding a code nobody uses excludes nothing, and no call site can show
 * you that.
 *
 * Same shape as the `819` breakpoint test, which is the proof this pattern is
 * fixable rather than a fact of life.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as codes from "@/lib/account-codes";

const CHART = join(
  process.cwd(),
  "..",
  "backend",
  "app",
  "core",
  "chart_of_accounts",
  "default_chart.py",
);

/** Every code the backend actually seeds, with its English name. */
function backendChart(): Map<string, string> {
  const source = readFileSync(CHART, "utf8");
  const named = new Map<string, string>();
  // Constants first: DefaultAccount rows may refer to a code by its constant.
  const constants = new Map(
    [...source.matchAll(/^([A-Z_]+_CODE) = "(\d{4})"/gm)].map((m) => [m[1], m[2]]),
  );
  for (const m of source.matchAll(
    /DefaultAccount\(\s*(?:"(\d{4})"|([A-Z_]+_CODE))\s*,\s*"([^"]+)"/g,
  )) {
    const code = m[1] ?? constants.get(m[2]);
    if (code) named.set(code, m[3]);
  }
  return named;
}

/** The codes this file exports, as `NAME -> "1234"`. */
function frontendCodes(): [string, string][] {
  return Object.entries(codes).filter(
    ([, value]) => typeof value === "string" && /^\d{4}$/.test(value),
  ) as [string, string][];
}

describe("account codes match the backend chart", () => {
  it("reads both sides", () => {
    // Over an empty parse every assertion below passes for the wrong reason —
    // which is how a guard ends up unable to fail.
    expect(backendChart().size).toBeGreaterThan(20);
    expect(frontendCodes().length).toBeGreaterThan(5);
  });

  it("names only codes the chart actually seeds", () => {
    const chart = backendChart();
    const unknown = frontendCodes()
      .filter(([, code]) => !chart.has(code))
      .map(([name, code]) => `${name} = ${code}`);

    expect(
      unknown,
      "these codes are not in default_chart.py, so whatever they were meant " +
        "to select or exclude, they do neither:\n" + unknown.join("\n"),
    ).toEqual([]);
  });

  it("keeps FX gain and group sales out of the manual pickers", () => {
    // The two the filter exists for, named rather than left to the reader.
    // 4400 passed the test above only because it was removed; this says what
    // the right answers are so a future edit cannot quietly swap one out.
    const chart = backendChart();
    expect(chart.get(codes.FX_GAIN_CODE)).toBe("FX Gain");
    expect(chart.get(codes.GROUP_SALES_REVENUE_CODE)).toBe("Group / Agency Sales");
  });

  it("agrees with the backend on what each code is called", () => {
    // A code that exists but means something else is the worse failure: the
    // picker still works and selects the wrong account.
    const chart = backendChart();
    const expected: Record<string, string> = {
      RETAINED_EARNINGS_CODE: "Retained Earnings",
      GENERAL_EXPENSE_CODE: "General Expense",
      SALARY_EXPENSE_CODE: "Salaries & Wages",
      CASH_OVER_SHORT_CODE: "Cash Over/Short",
      DELIVERY_COMMISSION_EXPENSE_CODE: "Delivery Platform Commission",
      SALES_DISCOUNT_CODE: "Sales Discounts",
    };
    for (const [name, label] of Object.entries(expected)) {
      const code = (codes as Record<string, string>)[name];
      expect(chart.get(code), `${name} (${code})`).toBe(label);
    }
  });

  it("leaves no bare account-code literals elsewhere in the app", () => {
    // The codes were scattered across five files before this. One home means
    // one place to be wrong, and one place a guard can watch.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
        if (path.endsWith("account-codes.ts")) continue;
        const source = readFileSync(path, "utf8");
        for (const line of source.split("\n")) {
          // Comments explain codes; code should not spell them.
          if (/^\s*(\*|\/\/)/.test(line)) continue;
          if (/"(3[1-9]\d\d|4[0-9]\d\d|5[0-9]\d\d)"/.test(line)) {
            offenders.push(`${path.replace(process.cwd(), "")}: ${line.trim()}`);
          }
        }
      }
    };
    walk(join(process.cwd(), "src"));

    expect(
      offenders,
      "account codes belong in lib/account-codes.ts, where the guard above " +
        "can check them against the chart:\n" + offenders.join("\n"),
    ).toEqual([]);
  });
});
