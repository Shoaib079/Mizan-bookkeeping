"use client";

/** General ledger — all journal entries (Reports → Financial statements). */

import Link from "next/link";
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
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { Input, Label, Select } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { journalEntryRowClassName } from "@/lib/ledger-display";
import {
  GENERIC_CORRECTABLE_SOURCES,
  GENERIC_VOID_SAFE_SOURCES,
  JOURNAL_SOURCES,
  sourceFlow,
  sourceLabel,
} from "@/lib/transaction-registry";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type JournalEntryLine = {
  id: string;
  account_id: string;
  amount_kurus: number;
  side: "debit" | "credit";
  line_number: number;
};

type JournalEntryRow = {
  id: string;
  entry_date: string;
  description: string;
  status: string;
  source: string;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  amends_entry_id: string | null;
  amended_by_entry_id: string | null;
  lines: JournalEntryLine[];
};

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

function ChainLink({
  label,
  entryId,
  onNavigate,
}: {
  label: string;
  entryId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="font-mono text-xs text-primary hover:underline"
      onClick={() => onNavigate(entryId)}
    >
      {label}: {entryId.slice(0, 8)}…
    </button>
  );
}

function EntryDetailPanel({
  row,
  accountLabel,
  onNavigateEntry,
}: {
  row: JournalEntryRow;
  accountLabel: (id: string) => string;
  onNavigateEntry: (id: string) => void;
}) {
  const chainLinks = [
    row.reverses_entry_id && {
      label: "Reverses",
      id: row.reverses_entry_id,
    },
    row.reversed_by_entry_id && {
      label: "Reversed by",
      id: row.reversed_by_entry_id,
    },
    row.amends_entry_id && {
      label: "Amends",
      id: row.amends_entry_id,
    },
    row.amended_by_entry_id && {
      label: "Amended by",
      id: row.amended_by_entry_id,
    },
  ].filter(Boolean) as { label: string; id: string }[];

  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Entry ID: <span className="font-mono">{row.id}</span>
        </span>
        <span>Source: {sourceLabel(row.source)}</span>
      </div>

      {chainLinks.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chainLinks.map((link) => (
            <ChainLink
              key={`${link.label}-${link.id}`}
              label={link.label}
              entryId={link.id}
              onNavigate={onNavigateEntry}
            />
          ))}
        </div>
      )}

      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Account</DataTableHeaderCell>
            <DataTableHeaderCell>Side</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {row.lines.map((line) => (
            <DataTableRow key={line.id}>
              <DataTableCell>{accountLabel(line.account_id)}</DataTableCell>
              <DataTableCell className="capitalize">{line.side}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(line.amount_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {(() => {
        const flow = sourceFlow(row.source);
        if (!flow || GENERIC_VOID_SAFE_SOURCES.has(row.source)) return null;
        return (
          <p className="text-xs text-muted-foreground">
            This entry is managed by its own flow — edit or void it in{" "}
            <Link href={flow.href} className="text-primary hover:underline">
              {flow.label}
            </Link>
            .
          </p>
        );
      })()}
    </div>
  );
}

function LedgerPanelContent() {
  const { entityId } = useEntity();
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "";
  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0");
  const focusId = searchParams.get("focus") ?? "";

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
  const [voidTarget, setVoidTarget] = useState<{
    entry_id: string;
    description: string;
  } | null>(null);
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
    params.set("from", from);
    params.set("to", to);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (q.trim()) params.set("q", q.trim());
    if (source) params.set("source", source);
    if (status) params.set("status", status);
    return params.toString();
  }, [from, to, offset, q, source, status]);

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
    setVoidTarget(null);
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
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={setRange}
        />

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
          <Button type="button" variant="secondary" disabled={loading} onClick={applySearch}>
            Apply search
          </Button>
        </div>
      </div>

      {forbidden && <ForbiddenMessage />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {!loading && !forbidden && (
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
            <DataTable>
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
                        <DataTableCell>{sourceLabel(row.source)}</DataTableCell>
                        <DataTableCell>{row.description}</DataTableCell>
                        <DataTableCell>
                          <StatusBadge status={row.status} />
                        </DataTableCell>
                        <DataTableCell align="right" className="tabular-nums">
                          {formatTry(entryTotalKurus(row.lines))}
                        </DataTableCell>
                        <DataTableCell align="right">
                          {row.status === "posted" &&
                            GENERIC_VOID_SAFE_SOURCES.has(row.source) && (
                              <SubledgerRowActions
                                row={{
                                  display_kind: "effective",
                                  journal_entry_id: row.id,
                                }}
                                showEdit={GENERIC_CORRECTABLE_SOURCES.has(
                                  row.source,
                                )}
                                onEdit={() =>
                                  setCorrectTarget({
                                    id: row.id,
                                    entry_date: row.entry_date,
                                    description: row.description,
                                    source: row.source,
                                    lines: row.lines,
                                  })
                                }
                                onVoid={() =>
                                  setVoidTarget({
                                    entry_id: row.id,
                                    description: row.description,
                                  })
                                }
                              />
                            )}
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
      )}

      <CorrectLedgerEntryForm
        open={correctTarget !== null}
        entry={correctTarget}
        onClose={() => setCorrectTarget(null)}
        onSaved={() => void reload()}
      />
      <VoidSubledgerDialog
        open={voidTarget !== null}
        title="Void ledger entry"
        description={voidTarget?.description}
        voidPath={
          entityId && voidTarget
            ? `/entities/${entityId}/ledger/entries/${voidTarget.entry_id}/void`
            : null
        }
        onClose={() => setVoidTarget(null)}
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
