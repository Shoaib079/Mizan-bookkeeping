"use client";

import Link from "next/link";

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
import { Receipt } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { isPendingReviewStatus } from "@/lib/review-status";
import { useEntityList } from "@/lib/use-entity-list";

type ExpenseReceiptRow = {
  id: string;
  status: string;
  expense_date: string;
  receipt_total_kurus: number | null;
  review_reason: string | null;
};

export function ReceiptsReviewPanel() {
  const { entityId } = useEntity();
  const { items, loading, error } = useEntityList<ExpenseReceiptRow>(
    "/expense-receipts",
    entityId,
  );
  const pending = items.filter((row) => isPendingReviewStatus(row.status));

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Confirm extracted line items from receipt photos before posting.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={4} />}
      {!loading && pending.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="Nothing to review"
          hint="Uploaded expense receipts awaiting review will appear here."
        />
      )}
      {!loading && pending.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {pending.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/review/receipts/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {formatTrDate(row.expense_date)}
                  </Link>
                </DataTableCell>
                <DataTableCell align="right">
                  {row.receipt_total_kurus != null
                    ? formatTry(row.receipt_total_kurus)
                    : "—"}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                  {row.review_reason && (
                    <p className="mt-1 max-w-xs truncate text-xs text-warning">
                      {row.review_reason}
                    </p>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
