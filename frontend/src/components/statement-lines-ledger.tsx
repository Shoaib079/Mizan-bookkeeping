"use client";

/** Full statement line ledger — search, filters, row selection. */

import { useMemo, useState } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BankStatementLine } from "@/lib/banking-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { classificationLabel } from "@/lib/statement-classification-options";
import {
  filterStatementLines,
  hasLedgerEntry,
  isSkippedLine,
  STATEMENT_LINE_FILTERS,
  type StatementLineFilter,
  summarizeStatementLines,
} from "@/lib/statement-line-filters";
import { cn } from "@/lib/utils";

type Props = {
  lines: BankStatementLine[];
  selectedLineId: string | null;
  skippedDuplicateCount?: number;
  onSelectLine: (lineId: string) => void;
};

export function StatementLinesLedger({
  lines,
  selectedLineId,
  skippedDuplicateCount = 0,
  onSelectLine,
}: Props) {
  const [filter, setFilter] = useState<StatementLineFilter>("all");
  const [search, setSearch] = useState("");

  const summary = useMemo(() => summarizeStatementLines(lines), [lines]);
  const filtered = useMemo(
    () => filterStatementLines(lines, filter, search),
    [lines, filter, search],
  );

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<StatementLineFilter, number>> = { all: lines.length };
    for (const tab of STATEMENT_LINE_FILTERS) {
      if (tab.id === "all") continue;
      counts[tab.id] = filterStatementLines(lines, tab.id, "").length;
    }
    return counts;
  }, [lines]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Statement ledger</h2>
          <p className="text-xs text-muted-foreground">
            {summary.total} lines · {summary.withLedger} in journal ·{" "}
            {summary.skipped} skipped (no GL) · {summary.queue} to post
            {skippedDuplicateCount > 0 &&
              ` · ${skippedDuplicateCount} duplicate rows skipped at import`}
          </p>
        </div>
        <Input
          type="search"
          placeholder="Search description or reference…"
          className="h-9 max-w-xs text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search statement lines"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATEMENT_LINE_FILTERS.map((tab) => {
          const count = filterCounts[tab.id] ?? 0;
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {tab.label}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      {filter === "skipped" && summary.skipped > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Skipped lines were marked &ldquo;Decide later&rdquo; — they never hit P&L or
          balance sheet. Select a row and use Correct to post them properly (e.g. Bank
          charges for BSM / havale fees).
        </p>
      )}

      {filter === "no_ledger" && summary.noLedger > 0 && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Lines without a journal entry: still in queue, skipped, or waiting for
          needs-review confirmation. Nothing here means your books already have a
          matching entry — use Correct only if the classification was wrong.
        </p>
      )}

      <DataTable className="max-h-[min(65vh,800px)]">
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Description</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Classification</DataTableHeaderCell>
            <DataTableHeaderCell>Journal</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                No lines match this filter.
              </td>
            </tr>
          ) : (
            filtered.map((line) => {
              const selected = line.id === selectedLineId;
              const amountClass =
                line.amount_kurus > 0
                  ? "text-success"
                  : line.amount_kurus < 0
                    ? "text-destructive"
                    : "";
              return (
                <tr
                  key={line.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/30",
                    selected && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    isSkippedLine(line) && "bg-warning/5",
                  )}
                  onClick={() => onSelectLine(line.id)}
                >
                  <DataTableCell className="whitespace-nowrap py-1.5 text-xs">
                    {formatTrDate(line.transaction_date)}
                  </DataTableCell>
                  <DataTableCell className="max-w-[28rem] py-1.5 text-xs">
                    <span
                      className="block whitespace-pre-wrap break-words leading-snug"
                      title={line.description}
                    >
                      {line.description}
                    </span>
                    {line.reference && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {line.reference}
                      </span>
                    )}
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className={cn("py-1.5 text-xs font-medium tabular-nums", amountClass)}
                  >
                    {formatTry(line.amount_kurus)}
                  </DataTableCell>
                  <DataTableCell className="py-1.5">
                    <StatusBadge status={line.status} />
                  </DataTableCell>
                  <DataTableCell className="py-1.5 text-xs">
                    {classificationLabel(line.classification)}
                  </DataTableCell>
                  <DataTableCell className="py-1.5 text-xs">
                    {hasLedgerEntry(line) ? (
                      <span className="text-muted-foreground">Posted</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DataTableCell>
                </tr>
              );
            })
          )}
        </DataTableBody>
      </DataTable>

      <p className="text-[11px] text-muted-foreground">
        Click any row to inspect or correct it in the bar above. Posted lines
        create debit/credit journal entries.
      </p>
    </section>
  );
}
