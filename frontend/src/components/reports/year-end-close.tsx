"use client";

/** Close the year — move the year's result into Retained Earnings.
 *
 * Revenue and expense accounts measure one year's trading and should start the
 * next year at zero. Left unclosed they accumulate forever, so the balance
 * sheet's "profit not yet distributed" line ends up mixing several years
 * (FINANCIAL_AUDIT F4). It also matters for partners: distributing profit
 * draws on Retained Earnings, and nothing ever put anything there.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { useToast } from "@/lib/toast";
import { apiFetch } from "@/lib/api";
import { formatTrDate, formatTry } from "@/lib/money";
import type { YearEndPreviewRead } from "@/lib/report-types";
import { closableYears, yearEndSummary } from "@/lib/month-close";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  isOwner: boolean;
};

export function YearEndClose({ entityId, isOwner }: Props) {
  const { toast } = useToast();
  const years = useMemo(() => closableYears(new Date()), []);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear() - 1);
  const [preview, setPreview] = useState<YearEndPreviewRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<YearEndPreviewRead>(
        `/entities/${entityId}/period-locks/year-end?year=${year}`,
      );
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, year]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleClose() {
    if (!entityId || !preview) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/period-locks/year-end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      toast(`${year} closed`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the year");
    } finally {
      setSubmitting(false);
    }
  }

  if (!preview && !loading) return null;

  const profit = preview ? preview.net_result_kurus >= 0 : true;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Close the year</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Moves the year&apos;s profit into Retained Earnings so the next
              year starts from zero. Posted as one entry dated 31 December.
            </p>
          </div>
        </div>
        <Combobox
          id="year-end-year"
          className="w-28"
          value={String(year)}
          onValueChange={(value) => setYear(Number(value))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {preview && (
        <>
          <p
            className={cn(
              "mb-3 rounded-md px-3 py-2 text-sm",
              preview.already_closed
                ? "bg-success/10 text-success"
                : preview.can_close
                  ? "bg-muted/40 text-muted-foreground"
                  : "bg-warning/10 text-warning",
            )}
          >
            {yearEndSummary(preview)}
          </p>

          {!preview.already_closed && preview.lines.length > 0 && (
            <>
              <dl className="mb-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Revenue for {year}</dt>
                  <dd className="tabular-nums">
                    {formatTry(preview.revenue_total_kurus)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Expenses for {year}</dt>
                  <dd className="tabular-nums">
                    {formatTry(preview.expense_total_kurus)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold">
                  <dt>
                    {profit ? "Profit" : "Loss"} to Retained Earnings on{" "}
                    {formatTrDate(preview.closing_date)}
                  </dt>
                  <dd className="tabular-nums">
                    {formatTry(preview.net_result_kurus)}
                  </dd>
                </div>
              </dl>

              <details className="mb-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {preview.lines.length} account
                  {preview.lines.length === 1 ? "" : "s"} will be zeroed
                </summary>
                <div className="mt-2">
                  <DataTable>
                    <DataTableHead>
                      <tr>
                        <DataTableHeaderCell>Account</DataTableHeaderCell>
                        <DataTableHeaderCell align="right">
                          Balance
                        </DataTableHeaderCell>
                      </tr>
                    </DataTableHead>
                    <DataTableBody>
                      {preview.lines.map((line) => (
                        <DataTableRow key={line.account_id}>
                          <DataTableCell>
                            {line.code} — {line.name}
                          </DataTableCell>
                          <DataTableCell align="right" className="tabular-nums">
                            {formatTry(line.balance_kurus)}
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
              </details>
            </>
          )}

          {isOwner && !preview.already_closed && (
            <Button
              type="button"
              disabled={submitting || !preview.can_close}
              onClick={() => void handleClose()}
            >
              {submitting ? "Closing…" : `Close ${year}`}
            </Button>
          )}
          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              Only the owner can close a year.
            </p>
          )}
        </>
      )}
    </section>
  );
}
