"use client";

/** Bank account activity — deposits, withdrawals, and book running balance. */

import { useCallback, useEffect, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import type { BankActivityRead, BankActivityRow } from "@/lib/banking-types";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  accountId: string;
  accountName?: string;
};

export function BankActivityPanel({ accountId, accountName }: Props) {
  const { entityId } = useEntity();
  const [range, setRange] = useState(currentMonthRange);
  const [data, setData] = useState<BankActivityRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const report = await apiFetch<BankActivityRead>(
        `/entities/${entityId}/banking/accounts/${accountId}/activity?${params}`,
      );
      setData(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, accountId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!entityId) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Account activity</h2>
          <p className="text-xs text-muted-foreground">
            Opening balance entries and imported statement lines on{" "}
            {accountName ?? "this account"}. Posted rows update the book
            balance.
          </p>
        </div>
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={loading}
          onChange={(from, to) => setRange({ from, to })}
        />
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      )}

      {data && (
        <>
          <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">Deposits (in)</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatTry(data.total_in_kurus)}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Posted {formatTry(data.posted_in_kurus)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">Payments (out)</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatTry(-data.total_out_kurus)}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Posted {formatTry(-data.posted_out_kurus)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">Net on statements</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatTry(data.net_flow_kurus)}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">Book balance</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatTry(data.closing_balance_kurus)}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Opening {formatTry(data.opening_balance_kurus)}
              </p>
            </div>
          </dl>

          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>Type</DataTableHeaderCell>
                <DataTableHeaderCell>Detail</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Book balance</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {data.rows.map((row, idx) => (
                <ActivityRow key={`${row.movement_kind}-${row.movement_date}-${idx}`} row={row} />
              ))}
            </DataTableBody>
          </DataTable>
        </>
      )}
    </section>
  );
}

function ActivityRow({ row }: { row: BankActivityRow }) {
  const isSummary = row.movement_kind === "opening" || row.movement_kind === "closing";
  const amount =
    row.amount_kurus === null ? "—" : formatTry(row.amount_kurus);

  return (
    <DataTableRow
      className={cn(
        isSummary && "bg-muted/30 font-medium",
        !row.affects_balance && row.movement_kind === "statement_line" && "opacity-70",
      )}
    >
      <DataTableCell>{formatTrDate(row.movement_date)}</DataTableCell>
      <DataTableCell>{row.movement_label}</DataTableCell>
      <DataTableCell className="max-w-xs truncate">
        <span title={row.detail}>{row.detail}</span>
      </DataTableCell>
      <DataTableCell align="right" className="tabular-nums">
        {amount}
      </DataTableCell>
      <DataTableCell align="right" className="tabular-nums">
        {formatTry(row.balance_kurus)}
      </DataTableCell>
    </DataTableRow>
  );
}
