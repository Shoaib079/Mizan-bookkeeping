"use client";

/** What the ledger allows for a page of rows, asked once.
 *
 * A partner or supplier page lists fifty movements, each with an Edit and a
 * Void button. Deciding that in the browser is how the app ended up with two
 * opinions that agreed only by coincidence — every void bug reported over
 * months was those two disagreeing. So the page asks.
 *
 * One request for the whole page. Buttons are hidden until the answer
 * arrives, not shown disabled: a button that appears and then vanishes is the
 * same "did I imagine that" problem as one that does nothing.
 */

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

export type EntryActions = {
  can_edit: boolean;
  can_void: boolean;
  void_path: string | null;
  edit: { kind: string; context: Record<string, unknown> } | null;
  /** How many owners share this entry — see the backend's `owner_count`. */
  owner_count: number;
};

type BatchResponse = { actions: Record<string, EntryActions> };

/** Nothing offered. The answer for a row we have not heard about yet, and for
 * one whose entry has gone. */
export const NO_ACTIONS: EntryActions = {
  can_edit: false,
  can_void: false,
  void_path: null,
  edit: null,
  owner_count: 1,
};

/**
 * `rowActions(entryId)` for every row on the page.
 *
 * Pass the ids currently rendered. The hook refetches when that set changes,
 * which includes after a void — the answer is meant to be different then.
 */
export function useEntryActions(entityId: string, entryIds: string[]) {
  const [actions, setActions] = useState<Record<string, EntryActions>>({});
  const [loaded, setLoaded] = useState(false);

  // Joined rather than passed as an array: a new array with the same contents
  // is a new dependency every render, and this would fetch forever.
  const key = entryIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!entityId || ids.length === 0) {
      setActions({});
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void apiFetch<BatchResponse>(`/entities/${entityId}/ledger/entries/actions`, {
      method: "POST",
      body: JSON.stringify({ entry_ids: ids }),
    })
      .then((res) => {
        if (!cancelled) {
          setActions(res.actions ?? {});
          setLoaded(true);
        }
      })
      .catch(() => {
        // A failed lookup means no buttons, which is the safe direction: it
        // withholds an action rather than offering one that may not work.
        if (!cancelled) {
          setActions({});
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, key]);

  return {
    loaded,
    /** The verdict for one row, honest while still loading. */
    rowActions(entryId: string | null | undefined): EntryActions {
      if (!entryId) return NO_ACTIONS;
      return actions[entryId] ?? NO_ACTIONS;
    },
  };
}

/**
 * Whether a page showing *one owner's row* may act on this entry.
 *
 * A profit allocation writes one row per partner against a single journal
 * entry, so voiding from Ali's row reverses Burak's and Cem's share too. The
 * General ledger shows the entry itself and may act on it; a page showing one
 * of its rows may not.
 *
 * Not the same as counting rows. A salary payment that consumed an advance
 * also writes two rows, but both belong to the same employee — voiding it
 * from that employee's page harms nobody, and counting rows would have hidden
 * a button that works.
 */
export function actionsForOneOwnersRow(actions: EntryActions): EntryActions {
  if (actions.owner_count > 1) return NO_ACTIONS;
  return actions;
}
