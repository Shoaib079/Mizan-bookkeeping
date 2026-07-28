"use client";

/** Cash book — one drawer as a statement, so physical cash can be matched.
 * Opening + money in − money out = what should be in the drawer, against the
 * last count. Reads the cash GL account, so every flow that touched cash shows. */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { Combobox } from "@/components/ui/combobox";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { CashBookRead } from "@/lib/report-types";
import { ledgerEntryHref, sourceLabel } from "@/lib/transaction-registry";
import { useReportRangeFromUrl } from "@/lib/use-report-url";
import { cn } from "@/lib/utils";

function CashBookContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [accounts, setAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [accountId, setAccountId] = useState("");
  const [report, setReport] = useState<CashBookRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    void apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    )
      .then((res) => {
        if (cancelled) return;
        const active = res.items.filter((a) => a.is_active);
        setAccounts(active);
        setAccountId((current) => current || active[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const reload = useCallback(async () => {
    if (!entityId || !accountId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch<CashBookRead>(
        `/entities/${entityId}/reports/cash-book?${queryString}&money_account_id=${accountId}`,
      );
      setReport(res);
    } catch (err) {
      if (isForbiddenError(err)) {
        setForbidden(true);
        setReport(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, accountId, queryString]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rollForward = useMemo(() => {
    if (!report) return [];
    return [
      { label: "Opening cash", value: report.opening_kurus },
      { label: "+ Money in", value: report.total_in_kurus },
      { label: "− Money out", value: report.total_out_kurus },
    ];
  }, [report]);

  const countGap = report?.last_count?.over_short_kurus ?? null;
  const netCounted = useMemo(
    () => (report?.counts ?? []).reduce((sum, c) => sum + c.over_short_kurus, 0),
    [report?.counts],
  );

  return (
    <AppShell title="Cash book">
      <p className="mb-4 text-sm text-muted-foreground">
        Everything that moved through this drawer — sales, expenses paid from
        the till, staff payments, deposits to the bank — and what should be left
        in it.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        {accounts.length > 0 && (
          <Combobox
            id="cash-book-account"
            className="w-56"
            value={accountId}
            onValueChange={setAccountId}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Cash drawer…"
          />
        )}
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {forbidden && <ForbiddenMessage />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {report && !loading && (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-4">
            <dl className="space-y-1 text-sm">
              {rollForward.map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="tabular-nums">{formatTry(line.value)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <dt>= Should be in the drawer</dt>
                <dd className="tabular-nums">{formatTry(report.closing_kurus)}</dd>
              </div>
            </dl>

            {report.last_count && (
              <div
                className={cn(
                  "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                  countGap === 0 && "bg-success/10 text-success",
                  countGap !== null && countGap > 0 && "bg-warning/10 text-warning",
                  countGap !== null &&
                    countGap < 0 &&
                    "bg-destructive/10 text-destructive",
                )}
              >
                <span>
                  Last counted {formatTrDate(report.last_count.session_date)} —{" "}
                  {formatTry(report.last_count.counted_kurus)}
                </span>
                <span className="font-semibold tabular-nums">
                  {countGap === 0
                    ? "Matched"
                    : `${countGap !== null && countGap > 0 ? "Over " : "Short "}${formatTry(Math.abs(countGap ?? 0))}`}
                </span>
              </div>
            )}
          </section>

          {report.source_totals.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Where it came from and went</h2>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Entries</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">In</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Out</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.source_totals.map((total) => (
                    <DataTableRow key={total.source}>
                      <DataTableCell>{sourceLabel(total.source)}</DataTableCell>
                      <DataTableCell align="right">{total.entry_count}</DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {total.in_kurus ? formatTry(total.in_kurus) : "—"}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {total.out_kurus ? formatTry(total.out_kurus) : "—"}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </section>
          )}

          {report.counts.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Count history</h2>
                <p className="text-xs text-muted-foreground">
                  {report.counts.length} count
                  {report.counts.length === 1 ? "" : "s"} ·{" "}
                  {report.counts.filter((c) => c.over_short_kurus === 0).length}{" "}
                  matched exactly · net{" "}
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      netCounted > 0 && "text-warning",
                      netCounted < 0 && "text-destructive",
                    )}
                  >
                    {formatTry(netCounted)}
                  </span>
                </p>
              </div>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Should be</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Counted</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Difference</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.counts.map((count) => (
                    <DataTableRow key={count.session_date}>
                      <DataTableCell>
                        {formatTrDate(count.session_date)}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {formatTry(count.expected_kurus)}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {formatTry(count.counted_kurus)}
                      </DataTableCell>
                      <DataTableCell
                        align="right"
                        className={cn(
                          "tabular-nums",
                          count.over_short_kurus === 0 && "text-muted-foreground",
                          count.over_short_kurus > 0 && "text-warning",
                          count.over_short_kurus < 0 && "text-destructive",
                        )}
                      >
                        {count.over_short_kurus === 0
                          ? "—"
                          : `${count.over_short_kurus > 0 ? "+" : ""}${formatTry(count.over_short_kurus)}`}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <p className="mt-2 text-xs text-muted-foreground">
                One short day is noise; the same drawer short repeatedly is a
                pattern worth looking into.
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">Every movement</h2>
            {report.rows.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No cash movements in this period"
                hint="Widen the date range, or pick another drawer."
              />
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell>What</DataTableHeaderCell>
                    <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">In</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Out</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.rows.map((row, index) => (
                    <DataTableRow key={`${row.journal_entry_id}-${index}`}>
                      <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
                      <DataTableCell>
                        <Link
                          href={ledgerEntryHref(row.journal_entry_id)}
                          className="hover:underline"
                        >
                          {row.description}
                        </Link>
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {sourceLabel(row.source)}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {row.in_kurus ? formatTry(row.in_kurus) : ""}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {row.out_kurus ? formatTry(row.out_kurus) : ""}
                      </DataTableCell>
                      <DataTableCell
                        align="right"
                        className="tabular-nums text-muted-foreground"
                      >
                        {formatTry(row.balance_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function CashBookPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CashBookContent />
    </Suspense>
  );
}
