/** The frontend's source-keyed verdicts match the backend's capability table.
 *
 * The General ledger draws its Edit and Void buttons from
 * `journalEntryRowActions` — the frontend's own copy — and only asks the API
 * what a click should *do*. So a source the frontend thinks is voidable and
 * the backend does not produces a button that fetches `void_path: null` and
 * returns without a word. Four sources were in exactly that state:
 * `opening_balance`, `pos_card_tip`, `credit_card_payment`, `cash_movement`.
 *
 * Nothing threw, nothing logged, and the symptom was "I click it and nothing
 * happens" — the report that has come in about void more times than any other.
 *
 * The two lists are compared here rather than kept in step by hand, because
 * "kept in step" is what the comment above the idempotency exempt list said
 * too, right up until it wasn't.
 *
 * Only the *source-keyed* half is compared. `partnerLedgerRowActions` and
 * friends answer a different question — see the note in subledger-actions.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { journalEntryRowActions } from "@/lib/subledger-actions";
import { JOURNAL_SOURCES } from "@/lib/transaction-registry";

const BACKEND = join(process.cwd(), "..", "backend", "app", "core", "ledger");

function read(file: string): string {
  return readFileSync(join(BACKEND, file), "utf8");
}

/** Sources the backend answers with a generic rule, before the table. */
function genericSets(): { correctable: Set<string>; voidSafe: Set<string> } {
  const correction = read("correction.py");
  const block = correction.match(
    /GENERIC_CORRECTABLE_SOURCES[\s\S]*?\n\)/,
  )?.[0];
  if (!block) throw new Error("GENERIC_CORRECTABLE_SOURCES not found");
  const correctable = new Set(
    [...block.matchAll(/JournalEntrySource\.([A-Z_]+)/g)].map((m) =>
      m[1].toLowerCase(),
    ),
  );
  // `_is_generic_void_safe` adds three by hand; read them rather than repeat.
  const helper = read("entry_actions.py").match(
    /def _is_generic_void_safe[\s\S]*?\n\n/,
  )?.[0];
  if (!helper) throw new Error("_is_generic_void_safe not found");
  const extra = [...helper.matchAll(/JournalEntrySource\.([A-Z_]+)/g)].map((m) =>
    m[1].toLowerCase(),
  );
  return { correctable, voidSafe: new Set([...correctable, ...extra]) };
}

/** Each source's row in the capability table, as `[can_edit, can_void]`. */
function tableVerdicts(): Map<string, [boolean, boolean]> {
  const source = read("entry_capabilities.py");
  // Bounded at the dict's closing brace. Without the end bound the final
  // row's chunk ran on into the escape functions below it and picked up their
  // `can_void=True`, reporting `opening_balance` as voidable — the same
  // unbounded-match mistake as the version before this one, one line lower.
  const start = source.indexOf("CAPABILITIES: dict");
  const table = source.slice(start, source.indexOf("\n}", start) + 2);
  const verdicts = new Map<string, [boolean, boolean]>();
  // Split on the key rather than matching a closing paren. Rows are written
  // both multi-line and as one-liners, and a pattern anchored on `\n    ),`
  // silently ran past every one-liner into the next row's body — reporting
  // `cash_movement` as editable because the row after it was.
  for (const chunk of table.split(/JournalEntrySource\./).slice(1)) {
    const name = chunk.match(/^([A-Z_]+):\s*Capability\(/)?.[1];
    if (!name) continue;
    verdicts.set(name.toLowerCase(), [
      /can_edit=True/.test(chunk),
      /can_void=True/.test(chunk),
    ]);
  }
  // The escapes answer per row, so their verdict is not in the table. Stated
  // here as the answer for the *ordinary* document of each kind, which is
  // what the frontend's source-keyed sets are describing.
  //
  // `invoice` covers a supplier invoice; the same source also carries credit
  // notes, which are void-only and have no source of their own to disagree
  // about — the frontend never sees them as a separate kind.
  verdicts.set("invoice", [true, true]);
  verdicts.set("customer_credit_sale", [true, true]);
  verdicts.set("group_sale", [true, true]);
  verdicts.set("partner_supplier_paid", [false, true]);
  return verdicts;
}

function backendVerdict(source: string): [boolean, boolean] {
  const { correctable, voidSafe } = genericSets();
  if (correctable.has(source)) return [true, true];
  if (voidSafe.has(source)) return [false, true];
  return tableVerdicts().get(source) ?? [false, false];
}

describe("source-keyed verdicts match the backend", () => {
  it("reads both sides", () => {
    // Over an empty parse every comparison below passes for the wrong reason.
    expect(JOURNAL_SOURCES.length).toBeGreaterThan(20);
    expect(tableVerdicts().size).toBeGreaterThan(20);
    expect(genericSets().correctable.size).toBeGreaterThan(2);
  });

  it("agrees on every journal source", () => {
    const differences: string[] = [];
    for (const source of JOURNAL_SOURCES) {
      const front = journalEntryRowActions(source);
      const [canEdit, canVoid] = backendVerdict(source);
      if (front.canEdit !== canEdit || front.canVoid !== canVoid) {
        differences.push(
          `${source}: frontend edit=${front.canEdit} void=${front.canVoid}, ` +
            `backend edit=${canEdit} void=${canVoid}`,
        );
      }
    }
    expect(
      differences,
      "The General ledger draws its buttons from the frontend's list and asks " +
        "the API what to do on click. Where they disagree the button either " +
        "does nothing, or is missing from something that works:\n" +
        differences.join("\n"),
    ).toEqual([]);
  });

  it("still finds a source of each kind, so the comparison is meaningful", () => {
    // A rule that answered [false, false] for everything would make the test
    // above pass while removing every button in the app.
    const verdicts = JOURNAL_SOURCES.map((s) => journalEntryRowActions(s));
    expect(verdicts.some((v) => v.canEdit && v.canVoid)).toBe(true);
    expect(verdicts.some((v) => !v.canEdit && v.canVoid)).toBe(true);
    expect(verdicts.some((v) => !v.canEdit && !v.canVoid)).toBe(true);
  });
});
