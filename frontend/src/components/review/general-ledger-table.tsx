"use client";

/** GL results: count/pager + expandable entry table. */

import { Fragment, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { CorrectableLedgerEntry } from "@/components/forms/correct-ledger-entry-form";
import { GlEntryActions } from "@/components/ledger/gl-entry-actions";
import {
  EntryDetailPanel,
  type JournalEntryLine,
  type JournalEntryRow,
} from "@/components/review/general-ledger-entry-detail";
import { PAGE_SIZE } from "@/components/review/use-general-ledger-panel";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { journalEntryRowClassName } from "@/lib/ledger-display";
import { formatTrDate, formatTry } from "@/lib/money";
import { ledgerRowSourceLabel } from "@/lib/transaction-registry";
import { cn } from "@/lib/utils";

function entryTotalKurus(lines: JournalEntryLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
    0,
  );
}

export type GeneralLedgerTableProps = {
  items: JournalEntryRow[];
  total: number;
  offset: number;
  pageStart: number;
  pageEnd: number;
  canPrev: boolean;
  canNext: boolean;
  focusId: string;
  expandedId: string | null;
  onExpandedIdChange: Dispatch<SetStateAction<string | null>>;
  onSetParams: (updates: Record<string, string | null>) => void;
  onCorrectTarget: (entry: CorrectableLedgerEntry) => void;
  onSaved: () => void;
  accountLabel: (accountId: string) => string;
  onNavigateEntry: (entryId: string) => void;
};

export function GeneralLedgerTable({
  items,
  total,
  offset,
  pageStart,
  pageEnd,
  canPrev,
  canNext,
  focusId,
  expandedId,
  onExpandedIdChange,
  onSetParams,
  onCorrectTarget,
  onSaved,
  accountLabel,
  onNavigateEntry,
}: GeneralLedgerTableProps) {
  return (
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
                onSetParams({
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
                onSetParams({
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
                          onExpandedIdChange((current) =>
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
                          onCorrectTarget({
                            id: row.id,
                            entry_date: row.entry_date,
                            description: row.description,
                            source: row.source,
                            lines: row.lines,
                          })
                        }
                        onSaved={onSaved}
                      />
                    </DataTableCell>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EntryDetailPanel
                          row={row}
                          accountLabel={accountLabel}
                          onNavigateEntry={onNavigateEntry}
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
  );
}
