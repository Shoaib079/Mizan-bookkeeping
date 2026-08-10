/** Every edit kind the API offers is either handled or reported.
 *
 * `resolve_ledger_entry_actions` returns `can_edit: true` plus an
 * `edit.kind`. `GlEntryActions.startEdit` switches on that kind. Five kinds
 * had no case and fell through `default: return` — so the General ledger drew
 * an Edit button on supplier invoices, supplier payments, group sales, FX
 * purchases and FX conversions, and pressing it did nothing at all.
 *
 * Nothing threw. Nothing logged. The reported symptom was "when i click on it
 * it does nothing", which is the only way this could ever have been noticed.
 *
 * So the two lists are compared here. A kind added to the backend now fails a
 * test instead of producing a dead button.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The kinds moved out of `entry_actions.py` when its 46 branches became a
 * table. Two forms live here now: `edit_kind="…"` on a table row, and
 * `kind="…"` inside the two escape functions whose answer depends on the row.
 * Both are matched below — reading only one would silently stop covering the
 * other. */
const BACKEND = join(
  process.cwd(),
  "..",
  "backend",
  "app",
  "core",
  "ledger",
  "entry_capabilities.py",
);
const HANDLER = join(
  process.cwd(),
  "src",
  "components",
  "ledger",
  "gl-entry-actions.tsx",
);

/** Kinds the General ledger cannot open yet, each with the reason.
 *
 * Listed rather than forgotten. They reach the `default` arm, which now says
 * so out loud instead of doing nothing — see the toast in `startEdit`.
 */
const KNOWN_UNWIRED: Record<string, string> = {
  // Empty, and worth keeping rather than deleting: every kind the backend
  // offers now opens something. `group_sale` was the last, and it was fixed
  // the way its own entry predicted — a loader that fetches the sale from the
  // id, instead of widening the edit context to carry a whole document.
};

function backendKinds(): string[] {
  const source = readFileSync(BACKEND, "utf8");
  return [
    ...new Set(
      [...source.matchAll(/(?:edit_)?kind="([a-z_]+)"/g)].map((m) => m[1]),
    ),
  ].sort();
}

function handledKinds(): string[] {
  const source = readFileSync(HANDLER, "utf8");
  return [...source.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).sort();
}

describe("General ledger edit kinds", () => {
  it("finds both lists", () => {
    // Without this, a changed code style makes every assertion below vacuous
    // by comparing two empty arrays.
    expect(backendKinds().length).toBeGreaterThan(8);
    expect(handledKinds().length).toBeGreaterThan(5);
  });

  it("handles every kind that is not a known gap", () => {
    const unhandled = backendKinds().filter(
      (kind) => !handledKinds().includes(kind) && !(kind in KNOWN_UNWIRED),
    );
    expect(
      unhandled,
      "These kinds render an Edit button that does nothing. Add a case in " +
        "gl-entry-actions.tsx, or add it to KNOWN_UNWIRED with the reason:\n" +
        unhandled.join("\n"),
    ).toEqual([]);
  });

  it("keeps the known-gap list honest", () => {
    // A kind that has since been wired must leave this list, or the list
    // becomes a place where stale excuses accumulate.
    const stillMissing = Object.keys(KNOWN_UNWIRED).filter(
      (kind) => !handledKinds().includes(kind),
    );
    expect(stillMissing.sort()).toEqual(Object.keys(KNOWN_UNWIRED).sort());
  });

  it("wires the two the owner hit", () => {
    expect(handledKinds()).toContain("supplier_invoice");
    expect(handledKinds()).toContain("supplier_payment");
  });

  it("handles every kind, with nothing left excused", () => {
    // The stronger statement, now that it is true. Written separately from
    // the filtered assertion above so that re-adding an entry to
    // KNOWN_UNWIRED cannot quietly restore a passing suite — it would keep
    // that test green and turn this one red.
    const unhandled = backendKinds().filter(
      (kind) => !handledKinds().includes(kind),
    );
    expect(unhandled, "every edit kind should open a form").toEqual([]);
    expect(Object.keys(KNOWN_UNWIRED)).toEqual([]);
  });

  it("says something when a kind falls through", () => {
    // The bug was `default: return`. Silence is what made a broken button
    // indistinguishable from a working one.
    const source = readFileSync(HANDLER, "utf8");
    const defaultArm = source.slice(source.lastIndexOf("default:"));
    expect(defaultArm).toContain("toast(");
  });
});
