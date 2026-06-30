"use client";

import { useState } from "react";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
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
import { Button } from "@/components/ui/button";
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
  invoice_kind: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  linked_platform_name: string | null;
  gross_kurus: number;
  review_reason: string | null;
  has_stored_document: boolean;
  source_type: string;
};

function InvoiceDraftTable({
  rows,
  expandedDraftId,
  onToggleExpand,
  onUpdated,
}: {
  rows: InvoiceDraftRow[];
  expandedDraftId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdated: (outcome?: "removed" | "updated") => void;
}) {
  return (
    <div className="space-y-3">
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Invoice</DataTableHeaderCell>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Counterparty</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Doc</DataTableHeaderCell>
            <DataTableHeaderCell>Review</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((row) => {
            const isCommission = row.invoice_kind === "delivery_commission";
            const counterparty = isCommission
              ? row.linked_platform_name ?? row.supplier_name ?? "—"
              : row.supplier_name ?? "—";
            const expanded = expandedDraftId === row.id;

            return (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{row.invoice_number}</span>
                    {isCommission && (
                      <span className="text-xs text-primary">
                        Delivery commission
                      </span>
                    )}
                  </div>
                </DataTableCell>
                <DataTableCell>{formatTrDate(row.invoice_date)}</DataTableCell>
                <DataTableCell>{counterparty}</DataTableCell>
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
                <DataTableCell>
                  {row.has_stored_document ? (
                    <InvoiceDocumentPreview
                      draftId={row.id}
                      sourceType={
                        row.source_type === "efatura_xml"
                          ? "efatura_xml"
                          : "efatura_pdf"
                      }
                      compact
                    />
                  ) : (
                    "—"
                  )}
                </DataTableCell>
                <DataTableCell>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs"
                    onClick={() => onToggleExpand(row.id)}
                  >
                    {expanded ? "Hide" : "Review"}
                  </Button>
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>

      {expandedDraftId && (
        <div className="rounded-lg border border-border bg-card p-4">
          <InvoiceDraftReview
            key={expandedDraftId}
            draftId={expandedDraftId}
            embedded
            onUpdated={onUpdated}
          />
        </div>
      )}
    </div>
  );
}

export function InvoicesReviewPanel() {
  const { entityId } = useEntity();
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const { items, loading, error, reload } = useEntityList<InvoiceDraftRow>(
    "/invoices/drafts",
    entityId,
  );
  const workbench = items.filter((row) => isInvoiceWorkbenchStatus(row.status));
  const readyToPost = workbench.filter((row) =>
    isReadyToPostInvoiceStatus(row.status),
  );
  const pending = workbench.filter((row) => isPendingReviewStatus(row.status));

  function toggleExpand(id: string) {
    setExpandedDraftId((current) => (current === id ? null : id));
  }

  function onDraftUpdated(outcome?: "removed" | "updated") {
    void reload();
    if (outcome === "removed") {
      setExpandedDraftId(null);
    }
  }

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
        Click Review on a row to expand actions — post, send back to review,
        discard, or reclassify.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={7} />}
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
            Confirmed — expand the row for Post, Send back to review, or Discard.
            Balances update only after posting.
          </p>
          <InvoiceDraftTable
            rows={readyToPost}
            expandedDraftId={expandedDraftId}
            onToggleExpand={toggleExpand}
            onUpdated={onDraftUpdated}
          />
        </section>
      )}
      {!loading && pending.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Needs review</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Link the supplier or delivery platform and confirm totals before
            posting.
          </p>
          <InvoiceDraftTable
            rows={pending}
            expandedDraftId={expandedDraftId}
            onToggleExpand={toggleExpand}
            onUpdated={onDraftUpdated}
          />
        </section>
      )}
    </>
  );
}
