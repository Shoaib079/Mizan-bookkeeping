"use client";

/** Full statement line ledger — search, filters, row selection, bulk checkboxes by date. */

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
import { canBulkSelectLine } from "@/lib/statement-bulk-selection";
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
  defaultFilter?: StatementLineFilter;
  onSelectLine: (lineId: string) => void;
  selectedLineIds?: ReadonlySet<string>;
  onToggleLineChecked?: (lineId: string, checked: boolean) => void;
  onSelectAllVisible?: (lineIds: string[], select: boolean) => void;
  onClearSelection?: () => void;
};

export function StatementLinesLedger({
  lines,
  selectedLineId,
  skippedDuplicateCount = 0,
  defaultFilter = "queue",
  onSelectLine,
  selectedLineIds,
  onToggleLineChecked,
  onSelectAllVisible,
  onClearSelection,
}: Props) {
  const [filter, setFilter] = useState<StatementLineFilter>(defaultFilter);
  const [search, setSearch] = useState("");

  const summary = useMemo(() => summarizeStatementLines(lines), [lines]);
  const filtered = useMemo(
    () => filterStatementLines(lines, filter, search),
    [lines, filter, search],
  );

  const selectableVisibleIds = useMemo(
    () => filtered.filter(canBulkSelectLine).map((line) => line.id),
    [filtered],
  );

  const selectedCount = selectedLineIds?.size ?? 0;
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedLineIds?.has(id));

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
            {selectedCount > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={onClearSelection}
                >
                  {selectedCount} selected — clear
                </button>
              </>
            )}
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
          balance sheet. Tick them and bulk-correct, or select one row for the bar above.
        </p>
      )}

      {filter === "no_ledger" && summary.noLedger > 0 && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Lines without a journal entry: still in queue, skipped, or waiting for
          needs-review confirmation.
        </p>
      )}

      <DataTable className="max-h-[min(65vh,800px)]">
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={allVisibleSelected}
                  disabled={selectableVisibleIds.length === 0}
                  aria-label="Select all visible lines"
                  onChange={(e) =>
                    onSelectAllVisible?.(selectableVisibleIds, e.target.checked)
                  }
                />
                <span>Date</span>
              </div>
            </DataTableHeaderCell>
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
              const checked = selectedLineIds?.has(line.id) ?? false;
              const bulkSelectable = canBulkSelectLine(line);
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
                    selected && selectedCount === 0 && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    checked && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    isSkippedLine(line) && "bg-warning/5",
                  )}
                  onClick={() => {
                    if (selectedCount > 0) return;
                    onSelectLine(line.id);
                  }}
                >
                  <DataTableCell className="whitespace-nowrap py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border"
                        checked={checked}
                        disabled={!bulkSelectable}
                        aria-label={`Select ${line.description}`}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleLineChecked?.(line.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{formatTrDate(line.transaction_date)}</span>
                    </div>
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
        Tick the box next to the date to select lines for bulk post or correct. Click a
        row (without ticks selected) to work one line in the bar above.
      </p>
    </section>
  );
}
