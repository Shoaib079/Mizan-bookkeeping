"use client";

/** The activity table every ledger uses (DESIGN_ARCHETYPES §"shared pieces").
 *
 * Staff, partner, customer, supplier and FX ledgers all show the same thing:
 * dated rows, a money column, an optional running balance, and per-row edit and
 * void. They had drifted on where the actions sit and how heavy they look — the
 * rule (trailing column, Edit and Void weighted alike) was written into
 * `SubledgerRowActions` on 2026-08-04 ahead of this component, so adopting it
 * changes no pixels; it just stops the next ledger inventing a fourth layout.
 *
 * Deliberately not a data grid. Each ledger keeps its own columns because they
 * genuinely differ — pax and forex on customers, extra days on staff, native
 * quantity on FX. What it owns is the frame: header, empty states, correction
 * history, band rows and the actions column. */

import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";

export type LedgerColumn = {
  key: string;
  label: React.ReactNode;
  align?: "left" | "right";
};

type Props = {
  columns: LedgerColumn[];
  /** Rendered inside `<tbody>` — rows, and band headers where a ledger groups. */
  children: React.ReactNode;

  /** True when the ledger has no movements at all. */
  isEmpty?: boolean;
  /** True when rows exist but the current filter or period hides them all. */
  isFiltered?: boolean;
  emptyMessage?: string;
  filteredMessage?: string;

  /** Correction history toggle — omit on ledgers that have no corrections. */
  history?: {
    hiddenCount: number;
    showHistory: boolean;
    onToggle: (next: boolean) => void;
  };
  /** Filter chips, date range: anything that narrows the rows. */
  controls?: React.ReactNode;
  /** Whether any row can be edited or voided — adds the trailing column. */
  hasActions?: boolean;
  /** Something the reader has to know before trusting the rows.
   *
   * Sits above the table rather than in `controls`, which is for things that
   * narrow the rows. The one case so far is an actions lookup that failed:
   * the ledger is correct but every Edit and Void is missing, and without a
   * word the page just looks broken. */
  notice?: React.ReactNode;
};

export function LedgerTable({
  columns,
  children,
  isEmpty = false,
  isFiltered = false,
  emptyMessage = "No movements yet.",
  filteredMessage = "No current entries — show correction history to see voided rows.",
  history,
  controls,
  hasActions = false,
  notice,
}: Props) {
  return (
    <>
      {notice}
      {(controls || history) && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {controls}
          {history && (
            <LedgerHistoryToggle
              hiddenCount={history.hiddenCount}
              showHistory={history.showHistory}
              onToggle={history.onToggle}
            />
          )}
        </div>
      )}

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : isFiltered ? (
        <p className="text-sm text-muted-foreground">{filteredMessage}</p>
      ) : (
        // The frame knows its own column count, so it decides rather than
        // asking every ledger to remember. `hasActions` counts: the partner
        // ledger declares five columns and renders six, which is exactly how
        // it slipped past a sweep that counted declared columns only.
        <DataTable wide={columns.length + (hasActions ? 1 : 0) > 5}>
          <DataTableHead>
            <tr>
              {columns.map((column) => (
                <DataTableHeaderCell key={column.key} align={column.align}>
                  {column.label}
                </DataTableHeaderCell>
              ))}
              {hasActions && (
                <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
              )}
            </tr>
          </DataTableHead>
          <DataTableBody>{children}</DataTableBody>
        </DataTable>
      )}
    </>
  );
}
