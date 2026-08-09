/** A page showing one owner's row must not act on an entry shared by several.
 *
 * A profit allocation writes one partner row per partner against a single
 * journal entry. Voiding from Ali's row reverses Burak's and Cem's share too,
 * and nothing on that screen would say so. The General ledger shows the entry
 * itself and may act on it; a partner page showing one of its rows may not.
 *
 * The distinction is *owners*, not rows. A salary payment that consumed an
 * advance also writes two rows on one entry, but both belong to the same
 * employee — voiding it from that employee's page harms nobody, and counting
 * rows would have hidden a button that works perfectly.
 */

import { describe, expect, it } from "vitest";

import {
  actionsForOneOwnersRow,
  NO_ACTIONS,
  type EntryActions,
} from "@/lib/use-entry-actions";

const allowed: EntryActions = {
  can_edit: true,
  can_void: true,
  void_path: "partners/p1/ledger/e1/void",
  edit: { kind: "partner_ledger", context: {} },
  owner_count: 1,
};

describe("actionsForOneOwnersRow", () => {
  it("passes an entry that belongs to one owner straight through", () => {
    // The half that keeps the page working. Without it, a function returning
    // NO_ACTIONS always would satisfy every other assertion here and remove
    // every button on the partner page.
    expect(actionsForOneOwnersRow(allowed)).toEqual(allowed);
  });

  it("withholds everything when the entry spans several owners", () => {
    const shared = { ...allowed, owner_count: 3 };
    expect(actionsForOneOwnersRow(shared)).toEqual(NO_ACTIONS);
  });

  it("withholds the void path too, not just the flags", () => {
    // Leaving the path behind would be worse than leaving the flag: a caller
    // that reads the path without checking the flag would still fire.
    const shared = { ...allowed, owner_count: 2 };
    expect(actionsForOneOwnersRow(shared).void_path).toBeNull();
    expect(actionsForOneOwnersRow(shared).edit).toBeNull();
  });

  it("treats two owners the same as many", () => {
    expect(actionsForOneOwnersRow({ ...allowed, owner_count: 2 })).toEqual(
      NO_ACTIONS,
    );
  });
});

describe("NO_ACTIONS", () => {
  it("offers nothing at all", () => {
    // It is the answer for a row still loading and for one whose entry has
    // gone. Both must draw no buttons rather than draw them and fail.
    expect(NO_ACTIONS.can_edit).toBe(false);
    expect(NO_ACTIONS.can_void).toBe(false);
    expect(NO_ACTIONS.void_path).toBeNull();
    expect(NO_ACTIONS.edit).toBeNull();
  });
});
