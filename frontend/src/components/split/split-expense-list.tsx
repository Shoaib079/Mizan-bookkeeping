"use client";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { formatTrDate, formatTry } from "@/lib/money";

import type { ExpenseCandidate } from "@/components/split/split-hub-types";

type Props = {
  expenses: ExpenseCandidate[];
  onSelect: (expenseId: string) => void;
};

export function SplitExpenseList({ expenses, onSelect }: Props) {
  if (expenses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bank expenses left to split. Classify outflows as Expense from bank
        first.
      </p>
    );
  }

  return (
    <div className="mb-8 overflow-x-auto">
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Description</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Left</DataTableHeaderCell>
            <DataTableHeaderCell> </DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {expenses.map((row) => (
            <DataTableRow key={row.expense_id}>
              <DataTableCell>{formatTrDate(row.expense_date)}</DataTableCell>
              <DataTableCell>{row.description}</DataTableCell>
              <DataTableCell align="right">
                {formatTry(row.amount_kurus)}
              </DataTableCell>
              <DataTableCell align="right">
                {formatTry(row.remaining_splittable_kurus)}
              </DataTableCell>
              <DataTableCell>
                <Button
                  type="button"
                  className="h-8"
                  onClick={() => onSelect(row.expense_id)}
                >
                  Select
                </Button>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
