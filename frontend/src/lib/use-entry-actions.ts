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

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

/** The backend's own cap, mirrored so the hook can stay under it.
 *
 * `MAX_ACTIONS_BATCH` in `features/ledger/schema.py`. The route does not
 * reject a longer list, it answers for the first 200 and drops the rest — so
 * a page with 250 rows silently lost its buttons from row 201 down, looking
 * exactly like a backend that had refused them. The hook asks in chunks
 * instead, which puts the cap where it belongs: on one request, not on what a
 * page may show.
 */
export const ACTIONS_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

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
/**
 * `rowActions(entryId)` for every row on the page.
 *
 * Pass the ids currently rendered. The hook refetches when that set changes,
 * which includes after a void — the answer is meant to be different then.
 *
 * `seed` is the answer a list endpoint already sent with its rows. Given one,
 * nothing is fetched and the buttons are there the moment the rows are; the
 * work is identical either way, and asking separately only meant the actions
 * column filled in a beat after the table drew. Without a seed it fetches as
 * before, which is what keeps a page working against a backend that has not
 * been redeployed yet.
 */
export function useEntryActions(
  entityId: string,
  entryIds: string[],
  seed?: Record<string, EntryActions>,
) {
  const seeded = seed !== undefined && Object.keys(seed).length > 0;
  const [actions, setActions] = useState<Record<string, EntryActions>>({});
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped by `retry()`. Part of the effect's dependencies so asking again is
  // the same code path as asking the first time.
  const [attempt, setAttempt] = useState(0);

  // Joined rather than passed as an array: a new array with the same contents
  // is a new dependency every render, and this would fetch forever.
  const key = entryIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (seeded) {
      // Already answered. Not merged with a fetch: two sources for one row is
      // how a page and the ledger came to disagree in the first place.
      return;
    }
    if (!entityId || ids.length === 0) {
      setActions({});
      setFailed(false);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setFailed(false);
    Promise.all(
      chunk(ids, ACTIONS_CHUNK_SIZE).map((batch) =>
        apiFetch<BatchResponse>(`/entities/${entityId}/ledger/entries/actions`, {
          method: "POST",
          body: JSON.stringify({ entry_ids: batch }),
        }),
      ),
    )
      .then((responses) => {
        if (cancelled) return;
        setActions(
          Object.assign({}, ...responses.map((res) => res.actions ?? {})),
        );
        setLoaded(true);
      })
      .catch(() => {
        // Still no buttons — withholding an action is safer than offering one
        // that may not work. But `failed` says so out loud, because a lookup
        // that never arrived and a backend that refused used to render
        // identically, and a page with no buttons anywhere reads as broken
        // either way. All-or-nothing on purpose: a half-answered page would
        // show buttons on some rows and not others with nothing to explain it.
        if (!cancelled) {
          setActions({});
          setFailed(true);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, key, attempt, seeded]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const answers = seeded ? seed! : actions;

  return {
    loaded: seeded || loaded,
    /** True when the lookup did not arrive — not when it came back empty. */
    failed: seeded ? false : failed,
    retry,
    /** The verdict for one row, honest while still loading. */
    rowActions(entryId: string | null | undefined): EntryActions {
      if (!entryId) return NO_ACTIONS;
      return answers[entryId] ?? NO_ACTIONS;
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
