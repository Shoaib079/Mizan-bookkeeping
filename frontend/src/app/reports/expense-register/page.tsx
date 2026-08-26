"use client";

/** Expense register — every expense posting in one place, whichever screen
 * recorded it (expenses, salaries, invoices, bank fees, commission, FX spend).
 * Built for the completeness check: scan a month and spot what's missing. */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import {
  ExpenseRegisterAccountTotals,
  ExpenseRegisterEntries,
} from "@/components/reports/expense-register-tables";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { ExpenseRegisterRead } from "@/lib/report-types";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function ExpenseRegisterContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
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

          <ExpenseRegisterAccountTotals
            totals={report.account_totals}
            onSelectAccount={setAccountId}
            isMobile={isMobile}
          />

          <section>
            <h2 className="mb-2 text-sm font-semibold">All entries</h2>
            {report.rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expenses in this period"
                hint="Widen the date range, or clear the search and account filter."
              />
            ) : (
              <ExpenseRegisterEntries
                rows={report.rows}
                isMobile={isMobile}
              />
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
