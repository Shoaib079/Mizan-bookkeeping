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
import {
  isInvoiceWorkbenchStatus,
  isPendingReviewStatus,
  isReadyToPostInvoiceStatus,
} from "@/lib/review-status";
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

function InvoiceDraftTable({ rows }: { rows: InvoiceDraftRow[] }) {
  return (
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
        {rows.map((row) => (
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
  );
}

export function InvoicesReviewPanel() {
  const { entityId } = useEntity();
  const { items, loading, error } = useEntityList<InvoiceDraftRow>(
    "/invoices/drafts",
    entityId,
  );
  const workbench = items.filter((row) => isInvoiceWorkbenchStatus(row.status));
  const readyToPost = workbench.filter((row) =>
    isReadyToPostInvoiceStatus(row.status),
  );
  const pending = workbench.filter((row) => isPendingReviewStatus(row.status));

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
        Uploaded supplier invoices stay here until posted to the ledger.
        Confirmed invoices must still be posted before they appear in payables.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}
      {!loading && workbench.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No supplier invoices in progress"
          hint="Upload e-Fatura files from Record or a supplier page. They appear here for review, then post to ledger to update payables."
        />
      )}
      {!loading && readyToPost.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">Ready to post</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Confirmed — open the invoice and use Post to ledger. Balances update
            only after posting.
          </p>
          <InvoiceDraftTable rows={readyToPost} />
        </section>
      )}
      {!loading && pending.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Needs review</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Link the supplier and confirm totals before posting.
          </p>
          <InvoiceDraftTable rows={pending} />
        </section>
      )}
    </>
  );
}
