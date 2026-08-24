"use client";

/** URL state, load, focus expand, and correct target for GeneralLedgerPanel. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { CorrectableLedgerEntry } from "@/components/forms/correct-ledger-entry-form";
import { isForbiddenError } from "@/components/reports/forbidden-message";
import type { JournalEntryRow } from "@/components/review/general-ledger-entry-detail";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { apiFetch } from "@/lib/api";
import { currentMonthRange, resolveReportRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";

const PAGE_SIZE = 50;

type ChartAccount = { id: string; code: string; name_en: string };

type LedgerListResponse = {
  items: JournalEntryRow[];
  total: number;
};

export { PAGE_SIZE };

export function useGeneralLedgerPanel() {
  const { entityId } = useEntity();
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  // Arriving with `?focus=` means something linked here to show one entry —
  // from an invoice, a receipt, a subledger row. Applying the default month
  // on top of that hides the entry the link exists to show, and an invoice
  // dated last month and uploaded this month lands there every time. Without
  // an explicit range in the URL, a focused link starts unfiltered.
  const focusId = searchParams.get("focus") ?? "";
  const hasExplicitRange =
    searchParams.get("from") !== null || searchParams.get("to") !== null;
  const rangeDefaults = useMemo(
    () => (focusId && !hasExplicitRange ? { from: "", to: "" } : defaults),
    [defaults, focusId, hasExplicitRange],
  );

  const { from, to } = useMemo(
    () =>
      resolveReportRange(
        searchParams.get("from"),
        searchParams.get("to"),
        rangeDefaults,
        new Date(),
        // The ledger lists entries, it does not project. An entry dated in
        // the future exists and has to be reachable — otherwise a misread
        // date makes an invoice impossible to void from inside the app.
        { allowFuture: true },
      ),
    [rangeDefaults, searchParams],
  );
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "";
  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0");
  /** Default view is the live books: voided entries and their "Void: …"
   * reversals are audit trail, not current state. `history=1` reveals them. */
  const showHistory = searchParams.get("history") === "1";

  const [searchDraft, setSearchDraft] = useState(q);
  const [items, setItems] = useState<JournalEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<CorrectableLedgerEntry | null>(
    null,
  );
  const [accounts, setAccounts] = useState<Record<string, ChartAccount>>({});

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      setParams({ from: nextFrom, to: nextTo, offset: "0", focus: null });
    },
    [setParams],
  );

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    // Omitted rather than sent empty: `from=` is not "no filter" to a date
    // query parameter, and this is the unfiltered case a focused link needs.
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (q.trim()) params.set("q", q.trim());
    if (source) params.set("source", source);
    if (showHistory) {
      if (status) params.set("status", status);
    } else {
      // Hides voided originals AND the system "Void: …" reversal entries.
      params.set("effective_only", "true");
    }
    return params.toString();
  }, [from, to, offset, q, source, status, showHistory]);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setForbidden(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch<LedgerListResponse>(
        `/entities/${entityId}/ledger/entries?${apiQuery}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (isForbiddenError(err)) {
        setForbidden(true);
        setItems([]);
        setTotal(0);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, apiQuery]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) {
      setAccounts({});
      return;
    }
    try {
      const res = await apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      );
      const map: Record<string, ChartAccount> = {};
      for (const account of res.items) map[account.id] = account;
      setAccounts(map);
    } catch {
      setAccounts({});
    }
  }, [entityId]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setExpandedId(null);
    setCorrectTarget(null);
    void reload();
  }, [entityId, reload]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!focusId) return;
    const found = items.some((row) => row.id === focusId);
    if (found) {
      setExpandedId(focusId);
      document
        .getElementById(`ledger-entry-${focusId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, items]);

  function accountLabel(accountId: string): string {
    const account = accounts[accountId];
    if (!account) return accountId.slice(0, 8);
    return formatChartAccountLabel(account);
  }

  function navigateToEntry(entryId: string) {
    setParams({ focus: entryId, offset: "0" });
  }

  function applySearch() {
    setParams({ q: searchDraft.trim() || null, offset: "0", focus: null });
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return {
    entityId,
    from,
    to,
    q,
    source,
    status,
    offset,
    showHistory,
    searchDraft,
    setSearchDraft,
    items,
    total,
    loading,
    error,
    forbidden,
    expandedId,
    setExpandedId,
    correctTarget,
    setCorrectTarget,
    setParams,
    setRange,
    reload,
    accountLabel,
    navigateToEntry,
    applySearch,
    pageStart,
    pageEnd,
    canPrev,
    canNext,
    focusId,
  };
}
