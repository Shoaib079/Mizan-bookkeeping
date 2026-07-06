"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CorrectExpenseForm,
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import {
  ExpenseRecordKindToggle,
  type ExpenseRecordKind,
} from "@/components/expenses/expense-record-kind-toggle";
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
  const [recordKind, setRecordKind] = useState<ExpenseRecordKind>("expense");
  const [formOpen, setFormOpen] = useState(false);

  return (
    <AppShell title="Expenses">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ExpenseRecordKindToggle value={recordKind} onChange={setRecordKind} />
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          {recordKind === "salary" ? "Pay salary" : "Record expense"}
        </Button>
      </div>

      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? recordKind === "salary"
              ? "Pay staff salary from cash or bank — pick the salary month separately from the payment date."
              : `${total} expense${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
      </div>

      {recordKind === "expense" && error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}
      {recordKind === "expense" && loading && <TableSkeleton columns={5} />}

      {recordKind === "expense" && !loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No expenses yet"
          hint="Use New → Manual expense or upload a receipt to get started."
        />
      )}

      {recordKind === "expense" && items.length > 0 && (
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

      {recordKind === "expense" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Record tips and other cash outflows with{" "}
          <strong>Record expense</strong> above, or use{" "}
          <strong>New → Manual expense</strong>. After a Z mismatch on daily sales,
          record the tip as a normal expense, then re-confirm on{" "}
          <Link href="/sales" className="text-primary hover:underline">
            Sales
          </Link>
          .
        </p>
      )}

      {recordKind === "salary" && entityId && (
        <p className="mt-4 text-sm text-muted-foreground">
          Salary posts through staff payable (not a generic expense line). Use{" "}
          <strong>Pay salary</strong> above, or Staff → employee → Pay salary.
        </p>
      )}

      <ManualExpenseForm
        open={formOpen}
        defaultRecordKind={recordKind}
        showRecordKindToggle={false}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />

      <CorrectExpenseForm
        open={correctExpense !== null}
        expense={correctExpense}
        onClose={() => setCorrectExpense(null)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
