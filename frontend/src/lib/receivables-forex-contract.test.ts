import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** The forex field name has to match on both sides of the wire.
 *
 * The frontend reads `outstanding_by_currency` off each receivables row. If
 * the backend ever renames that field, nothing breaks: the property is
 * optional, `?? []` swallows the undefined, and every customer quietly shows
 * a lira figure with no currency beneath it. The bug looks like "the feature
 * was never built" rather than like a fault, which is the worst kind.
 *
 * This is the same shape of failure as the manual journal form sending
 * "DEBIT" where the API wanted "debit" — a contract mismatch that types
 * cannot see, because the two sides are written in different languages.
 *
 * Reading the Python is unusual for a frontend test, and deliberate: the
 * schema is the contract, and asserting against a copy of it would only pin
 * the copy.
 */

const SCHEMA = new URL(
  "../../../backend/app/features/receivables/schema.py",
  import.meta.url,
).pathname;

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the receivables forex contract", () => {
  it("the backend still sends outstanding_by_currency", () => {
    // Skip rather than fail if the backend is not checked out alongside —
    // a missing sibling directory is not a broken contract.
    if (!existsSync(SCHEMA)) return;
    const schema = readFileSync(SCHEMA, "utf8");
    expect(
      schema,
      "CustomerReceivableBalanceRead no longer carries outstanding_by_currency — the customers list will silently show no currency",
    ).toMatch(/outstanding_by_currency\s*:/);
  });

  it("the frontend reads that exact field", () => {
    const map = sourceDeclaring("ForexOutstanding");
    expect(map).toContain("outstanding_by_currency");
  });

  it("a row with no forex is treated as lira-only, not as missing data", () => {
    const map = sourceDeclaring("ForexOutstanding");
    // Absent from the map means "billed in lira", and the page prints nothing
    // extra. If this became `?? undefined` with no filter, every row would
    // render an empty currency line.
    expect(map).toMatch(/filter\(\(r\) => r\.forex && r\.forex\.length > 0\)/);
  });

  it("both the table and the phone cards show it", () => {
    const page = read(
      "../app/(customers-section)/customers/page.tsx",
    );
    // Two renderers, one list. The mobile card view was added later than the
    // table and is the one that gets forgotten.
    const uses = page.match(/formatForexBalanceSummary\(/g) ?? [];
    expect(
      uses.length,
      "the desktop table and the mobile cards must both render the currency",
    ).toBe(2);
  });
});
