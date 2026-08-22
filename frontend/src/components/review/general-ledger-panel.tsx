"use client";

/** General ledger — all journal entries (Reports → Financial statements). */

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  CorrectLedgerEntryForm,
  type CorrectableLedgerEntry,
} from "@/components/forms/correct-ledger-entry-form";
import { GlEntryActions } from "@/components/ledger/gl-entry-actions";
import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  EntryDetailPanel,
  type JournalEntryLine,
  type JournalEntryRow,
} from "@/components/review/general-ledger-entry-detail";
import { GeneralLedgerExportMenu } from "@/components/review/general-ledger-export-menu";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { Input, Label, Select } from "@/components/ui/input";
import { AfterFirstLoad, PageSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { apiFetch } from "@/lib/api";
import { currentMonthRange, resolveReportRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { journalEntryRowClassName } from "@/lib/ledger-display";
import {
  JOURNAL_SOURCES,
  ledgerRowSourceLabel,
  sourceLabel,
} from "@/lib/transaction-registry";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type ChartAccount = { id: string; code: string; name_en: string };

type LedgerListResponse = {
  items: JournalEntryRow[];
  total: number;
};

function entryTotalKurus(lines: JournalEntryLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
    0,
  );
}

function LedgerPanelContent() {
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

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Every journal entry for this restaurant — posted and voided. Edit or
        void manual journals and bank charges directly here; expand any other
        entry for a direct link to the flow that manages it.
      </p>

      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <ReportDateRange
            allowFuture
            from={from}
            to={to}
            disabled={loading}
            onChange={setRange}
          />
          <GeneralLedgerExportMenu
            entityId={entityId}
            from={from}
            to={to}
            q={q}
            source={source}
            status={status}
            showHistory={showHistory}
            disabled={loading}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="ledger-search">Search description</Label>
            <Input
              id="ledger-search"
              className="mt-1"
              value={searchDraft}
              disabled={loading}
              placeholder="Filter by description…"
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
          </div>
          <div>
            <Label htmlFor="ledger-source">Source</Label>
            <Select
              id="ledger-source"
              className="mt-1 w-44"
              value={source}
              disabled={loading}
              onChange={(e) =>
                setParams({
                  source: e.target.value || null,
                  offset: "0",
                  focus: null,
                })
              }
            >
              <option value="">All sources</option>
              {JOURNAL_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {sourceLabel(value)}
                </option>
              ))}
            </Select>
          </div>
          {showHistory && (
            <div>
              <Label htmlFor="ledger-status">Status</Label>
              <Select
                id="ledger-status"
                className="mt-1 w-36"
                value={status}
                disabled={loading}
                onChange={(e) =>
                  setParams({
                    status: e.target.value || null,
                    offset: "0",
                    focus: null,
                  })
                }
              >
                <option value="">All</option>
                <option value="posted">Posted</option>
                <option value="voided">Voided</option>
              </Select>
            </div>
          )}
          <Button type="button" variant="secondary" disabled={loading} onClick={applySearch}>
            Apply search
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showHistory}
              disabled={loading}
              className="h-4 w-4 rounded border-border"
              onChange={(e) =>
                setParams({
                  history: e.target.checked ? "1" : null,
                  status: null,
                  offset: "0",
                  focus: null,
                })
              }
            />
            Show voids &amp; corrections
          </label>
        </div>
      </div>

      {forbidden && <ForbiddenMessage />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <PageSkeleton when={loading} />

      <AfterFirstLoad when={loading}>{!forbidden && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No entries in this range."
                : `${total} entr${total === 1 ? "y" : "ies"} · showing ${pageStart}–${pageEnd}`}
            </p>
            {total > PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3"
                  disabled={!canPrev}
                  onClick={() =>
                    setParams({
                      offset: String(Math.max(0, offset - PAGE_SIZE)),
                      focus: null,
                    })
                  }
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3"
                  disabled={!canNext}
                  onClick={() =>
                    setParams({
                      offset: String(offset + PAGE_SIZE),
                      focus: null,
                    })
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          {focusId && !items.some((row) => row.id === focusId) && (
            <p className="mb-3 text-xs text-muted-foreground">
              Linked entry not on this page — widen the date range or browse pages.
            </p>
          )}

          {items.length > 0 && (
            <DataTable wide>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>&nbsp;</DataTableHeaderCell>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Source</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                  <DataTableHeaderCell>Actions</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {items.map((row) => {
                  const expanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        id={`ledger-entry-${row.id}`}
                        className={cn(
                          row.id === focusId
                            ? "bg-primary/5 hover:bg-muted/20"
                            : "hover:bg-muted/20",
                          journalEntryRowClassName(row.status),
                        )}
                      >
                        <DataTableCell>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                            aria-expanded={expanded}
                            aria-label={expanded ? "Collapse entry" : "Expand entry"}
                            onClick={() =>
                              setExpandedId((current) =>
                                current === row.id ? null : row.id,
                              )
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        </DataTableCell>
                        <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
                        <DataTableCell>
                          {ledgerRowSourceLabel(row.source, row.reverses_entry_id)}
                        </DataTableCell>
                        <DataTableCell>{row.description}</DataTableCell>
                        <DataTableCell>
                          <StatusBadge status={row.status} />
                        </DataTableCell>
                        <DataTableCell align="right" className="tabular-nums">
                          {formatTry(entryTotalKurus(row.lines))}
                        </DataTableCell>
                        <DataTableCell align="right">
                          <GlEntryActions
                            row={row}
                            onGenericEdit={() =>
                              setCorrectTarget({
                                id: row.id,
                                entry_date: row.entry_date,
                                description: row.description,
                                source: row.source,
                                lines: row.lines,
                              })
                            }
                            onSaved={() => void reload()}
                          />
                        </DataTableCell>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <EntryDetailPanel
                              row={row}
                              accountLabel={accountLabel}
                              onNavigateEntry={navigateToEntry}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </DataTableBody>
            </DataTable>
          )}
        </>
      )}</AfterFirstLoad>

      <CorrectLedgerEntryForm
        open={correctTarget !== null}
        entry={correctTarget}
        onClose={() => setCorrectTarget(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}

export function GeneralLedgerPanel() {
  return (
    <Suspense>
      <LedgerPanelContent />
    </Suspense>
  );
}
