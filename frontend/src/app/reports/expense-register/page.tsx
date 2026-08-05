"use client";

/** Expense register — every expense posting in one place, whichever screen
 * recorded it (expenses, salaries, invoices, bank fees, commission, FX spend).
 * Built for the completeness check: scan a month and spot what's missing. */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { PageSkeleton } from "@/components/ui/skeleton";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { ExpenseRegisterRead } from "@/lib/report-types";
import { sourceLabel } from "@/lib/transaction-registry";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useReportRangeFromUrl } from "@/lib/use-report-url";
import { ledgerEntryHref } from "@/lib/transaction-registry";

function ExpenseRegisterContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<ExpenseRegisterRead | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim(), 300);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams(queryString);
    if (search) params.set("q", search);
    if (accountId) params.set("account_id", accountId);
    return params.toString();
  }, [queryString, search, accountId]);

  const reload = useCallback(async () => {
    if (!entityId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch<ExpenseRegisterRead>(
        `/entities/${entityId}/reports/expense-register?${query}`,
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
  }, [entityId, query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AppShell title="Expense register">
      <ReportPage
        title="Expense register"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="expense register"
        hasReport={Boolean(report)}
        meta={
          <>
            Every expense that reached the books in this period — from expenses,
        salaries, supplier invoices, bank charges, commission and FX spend — in
        one list. The total matches the P&amp;L for the same range.
          </>
        }
      >

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <Input
          value={searchDraft}
          disabled={!entityId}
          placeholder="Search description…"
          className="w-56"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        {accountId && (
          <button
            type="button"
            onClick={() => setAccountId("")}
            className="text-sm text-primary hover:underline"
          >
            Clear account filter
          </button>
        )}
      </div>

      {report && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total expenses" amountKurus={report.total_kurus} />
            <StatCard label="Entries" value={String(report.entry_count)} />
            <StatCard
              label="Accounts used"
              value={String(report.account_totals.length)}
            />
          </div>

          {report.account_totals.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">By account</h2>
              <DataTable wide>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Account</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Entries</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.account_totals.map((total) => (
                    <DataTableRow
                      key={total.account_id}
                      className="cursor-pointer"
                      onClick={() => setAccountId(total.account_id)}
                    >
                      <DataTableCell>
                        {total.account_code} — {total.account_name}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {total.entry_count}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {formatTry(total.amount_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">All entries</h2>
            {report.rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expenses in this period"
                hint="Widen the date range, or clear the search and account filter."
              />
            ) : (
              <DataTable wide>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell>Account</DataTableHeaderCell>
                    <DataTableHeaderCell>Description</DataTableHeaderCell>
                    <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.rows.map((row, index) => (
                    <DataTableRow key={`${row.journal_entry_id}-${index}`}>
                      <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
                      <DataTableCell>
                        {row.account_code} — {row.account_name}
                      </DataTableCell>
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
                        {formatTry(row.amount_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </section>
        </div>
      )}
      </ReportPage>
    </AppShell>
  );
}

export default function ExpenseRegisterPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExpenseRegisterContent />
    </Suspense>
  );
}
