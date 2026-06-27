"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CorrectExpenseForm,
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wallet } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";

export default function ExpensesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } =
    useEntityList<CorrectableExpenseRow>("/expenses", entityId);
  const [correctExpense, setCorrectExpense] =
    useState<CorrectableExpenseRow | null>(null);

  return (
    <AppShell title="Expenses">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} expense${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No expenses yet"
          hint="Use New → Manual expense or upload a receipt to get started."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
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
                <DataTableCell align="right">
                  {row.status === "posted" && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCorrectExpense(row)}
                    >
                      Correct
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Record tips and other cash outflows via <strong>New → Manual expense</strong>.
        After a Z mismatch on daily sales, record the tip as a normal expense, then
        re-confirm on{" "}
        <Link href="/sales" className="text-primary hover:underline">
          Sales
        </Link>
        .
      </p>

      <CorrectExpenseForm
        open={correctExpense !== null}
        expense={correctExpense}
        onClose={() => setCorrectExpense(null)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
