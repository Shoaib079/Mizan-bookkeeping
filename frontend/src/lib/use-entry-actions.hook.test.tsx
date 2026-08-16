// @vitest-environment jsdom

/** The hook's two silent failures, made loud.
 *
 * `use-entry-actions.test.ts` beside this covers `actionsForOneOwnersRow`,
 * which is a pure function and needs no React. Neither of the faults here is
 * reachable from a pure function, because both are about the request:
 *
 *  1. Any error — 401, 500, offline — emptied the map and set `loaded`. The
 *     page then drew no buttons, which is exactly what it draws when the
 *     backend legitimately refuses. The owner reported "no edit or void on
 *     partner page" and neither they nor the screen could tell which it was.
 *
 *  2. The route answers for the first 200 ids and drops the rest without
 *     complaint. A ledger of 250 rows lost its buttons from row 201 down, and
 *     that too looked like a refusal.
 *
 * Both are asserted from the outside — what was requested, what the hook then
 * reports — rather than by reaching into its state.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { ACTIONS_CHUNK_SIZE, useEntryActions } from "@/lib/use-entry-actions";

const ALLOWED = {
  can_edit: true,
  can_void: true,
  void_path: "partners/p1/ledger/e/void",
  edit: { kind: "partner_ledger", context: {} },
  owner_count: 1,
};

function idsOf(callIndex: number): string[] {
  const body = apiFetch.mock.calls[callIndex][1].body as string;
  return JSON.parse(body).entry_ids;
}

afterEach(() => {
  apiFetch.mockReset();
});

describe("when the lookup fails", () => {
  it("says so, instead of looking like a refusal", async () => {
    apiFetch.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useEntryActions("ent-1", ["e1"]));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.failed).toBe(true);
    // Still withholding the buttons — that half was right and must not move.
    expect(result.current.rowActions("e1").can_void).toBe(false);
  });

  it("recovers on retry without the page reloading its rows", async () => {
    apiFetch.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useEntryActions("ent-1", ["e1"]));
    await waitFor(() => expect(result.current.failed).toBe(true));

    apiFetch.mockResolvedValue({ actions: { e1: ALLOWED } });
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(result.current.rowActions("e1").can_void).toBe(true);
  });

  it("does not cry failure when the answer is simply empty", async () => {
    // An entry that has gone is absent from the reply by design. That is a
    // real answer, not a missing one, and must not raise the warning.
    apiFetch.mockResolvedValue({ actions: {} });
    const { result } = renderHook(() => useEntryActions("ent-1", ["e1"]));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.failed).toBe(false);
  });
});

describe("when there are more rows than one request may carry", () => {
  it("asks in chunks rather than losing the tail", async () => {
    const ids = Array.from({ length: ACTIONS_CHUNK_SIZE + 30 }, (_, i) => `e${i}`);
    apiFetch.mockImplementation((_path: string, init: { body: string }) => {
      const batch = JSON.parse(init.body).entry_ids as string[];
      return Promise.resolve({
        actions: Object.fromEntries(batch.map((id) => [id, ALLOWED])),
      });
    });

    const { result } = renderHook(() => useEntryActions("ent-1", ids));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(idsOf(0)).toHaveLength(ACTIONS_CHUNK_SIZE);
    expect(idsOf(1)).toHaveLength(30);
    // The row the backend used to drop on the floor.
    expect(result.current.rowActions(ids[ids.length - 1]).can_void).toBe(true);
  });

  it("never puts more than the cap in one request", async () => {
    // Guard the guard: chunking into sizes the route still truncates would
    // satisfy the count above while losing rows exactly as before.
    const ids = Array.from({ length: 500 }, (_, i) => `e${i}`);
    apiFetch.mockResolvedValue({ actions: {} });

    const { result } = renderHook(() => useEntryActions("ent-1", ids));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    for (let call = 0; call < apiFetch.mock.calls.length; call += 1) {
      expect(idsOf(call).length).toBeLessThanOrEqual(ACTIONS_CHUNK_SIZE);
    }
  });

  it("keeps one request when the page fits in one", async () => {
    // The common case. Chunking must not turn every ledger into two calls.
    apiFetch.mockResolvedValue({ actions: {} });
    const { result } = renderHook(() => useEntryActions("ent-1", ["e1", "e2"]));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
