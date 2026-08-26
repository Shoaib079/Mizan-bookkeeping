"use client";

/** Desktop expenses review table. */

import {
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { expenseVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import { formatTrDate, formatTry } from "@/lib/money";
import { isPendingReviewStatus } from "@/lib/review-status";
import { cn } from "@/lib/utils";

type Props = {
  items: CorrectableExpenseRow[];
  onCorrect: (row: CorrectableExpenseRow) => void;
  onVoid: (target: { expense_id: string; description: string }) => void;
};

export function ExpensesReviewTable({ items, onCorrect, onVoid }: Props) {
  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell>Notes</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {items.map((row) => {
          const isVoided = row.status === "voided";
          return (
            <DataTableRow key={row.id}>
              <DataTableCell
                className={isVoided ? "text-muted-foreground" : undefined}
              >
                {formatTrDate(row.expense_date)}
              </DataTableCell>
              <DataTableCell
                className={
                  isVoided ? "text-muted-foreground line-through" : undefined
                }
              >
                {row.written_item_description || row.description}
              </DataTableCell>
              <DataTableCell
                className={cn(
                  "max-w-[14rem] text-muted-foreground",
                  isVoided && "line-through",
                )}
              >
                <span className="block truncate" title={row.notes ?? undefined}>
                  {row.notes?.trim() ? row.notes : "—"}
                </span>
              </DataTableCell>
              <DataTableCell
                align="right"
                className={
                  isVoided ? "text-muted-foreground line-through" : undefined
                }
              >
                {formatTry(row.amount_kurus)}
              </DataTableCell>
              <DataTableCell>
                <StatusBadge status={row.status} />
              </DataTableCell>
              <DataTableCell align="right">
                {row.status === "posted" ? (
                  <SubledgerRowActions
                    row={{
                      display_kind: "effective",
                      journal_entry_id: row.journal_entry_id,
                    }}
                    voidConfirmDetail={expenseVoidConfirmDetail(row)}
                    onEdit={() => onCorrect(row)}
                    onVoid={() =>
                      onVoid({
                        expense_id: row.id,
                        description:
                          row.written_item_description || row.description,
                      })
                    }
                  />
                ) : isPendingReviewStatus(row.status) ? (
                  <span className="text-xs text-muted-foreground">
                    Confirm via Record
                  </span>
                ) : null}
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
