"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";

type ExpenseRow = {
  id: string;
  expense_date: string;
  description: string;
  written_item_description: string | null;
  amount_kurus: number;
  status: string;
};

export default function ExpensesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error } = useEntityList<ExpenseRow>(
    "/expenses",
    entityId,
  );

  return (
    <AppShell title="Expenses">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} expense${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading expenses…</p>
      )}

      {!loading && entityId && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No expenses yet. Use <strong>New → Manual expense</strong> or upload a
          receipt.
        </p>
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>{formatTrDate(row.expense_date)}</DataTableCell>
                <DataTableCell>
                  {row.written_item_description || row.description}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.amount_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Receipt intakes in review open from{" "}
        <Link href="/uploads" className="text-primary hover:underline">
          Uploads
        </Link>{" "}
        (coming soon).
      </p>
    </AppShell>
  );
}
