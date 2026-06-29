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
import { FileText } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { isPendingReviewStatus } from "@/lib/review-status";
import { useEntityList } from "@/lib/use-entity-list";

type InvoiceDraftRow = {
  id: string;
  status: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  gross_kurus: number;
  review_reason: string | null;
};

export function InvoicesReviewPanel() {
  const { entityId } = useEntity();
  const { items, loading, error } = useEntityList<InvoiceDraftRow>(
    "/invoices/drafts",
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
        Link suppliers and confirm e-Fatura drafts before posting.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}
      {!loading && pending.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Nothing to review"
          hint="Uploaded supplier invoices awaiting review will appear here."
        />
      )}
      {!loading && pending.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Invoice</DataTableHeaderCell>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Supplier</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {pending.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/review/invoices/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.invoice_number}
                  </Link>
                </DataTableCell>
                <DataTableCell>{formatTrDate(row.invoice_date)}</DataTableCell>
                <DataTableCell>{row.supplier_name ?? "—"}</DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.gross_kurus)}
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
