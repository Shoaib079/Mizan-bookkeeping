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
import { ShoppingBag } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import { useEntityList } from "@/lib/use-entity-list";

export function SalesReviewPanel() {
  const { entityId } = useEntity();
  const { items, loading, error } = useEntityList<PosDailySummary>(
    "/pos/daily-summaries",
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
        Confirm or correct daily POS summaries before they post.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}
      {!loading && pending.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="Nothing to review"
          hint="Uploaded or manual sales awaiting review will appear here."
        />
      )}
      {!loading && pending.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Cash</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Card</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {pending.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/sales/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.summary_date ? formatTrDate(row.summary_date) : "—"}
                  </Link>
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.cash_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.card_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.total_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                  {row.review_reason && row.status === "needs_review" && (
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
