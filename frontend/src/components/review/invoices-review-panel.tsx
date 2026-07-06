"use client";

import { useMemo, useState } from "react";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { ReportDateRange } from "@/components/reports/report-date-range";
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
import { invalidateReviewCounts } from "@/lib/review-counts-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { invoiceKindLabel } from "@/lib/invoice-classification";
import {
  filterInvoicesByTab,
  INVOICE_REVIEW_TABS,
  invoiceCounterpartyLabel,
  invoiceReviewEmptyState,
  type InvoiceDraftListRow,
  type InvoiceReviewTab,
} from "@/lib/invoice-draft-list";
import { useEntityList } from "@/lib/use-entity-list";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useInvoicesReviewUrl } from "@/lib/use-invoices-review-url";
import { cn } from "@/lib/utils";

function InvoiceDraftTable({
  rows,
  expandedDraftId,
  onToggleExpand,
  onUpdated,
  readOnly = false,
}: {
  rows: InvoiceDraftListRow[];
  expandedDraftId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdated: (outcome?: "removed" | "updated") => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Invoice</DataTableHeaderCell>
            <DataTableHeaderCell>Counterparty</DataTableHeaderCell>
            <DataTableHeaderCell>Kind</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            {!readOnly && <DataTableHeaderCell>Doc</DataTableHeaderCell>}
            <DataTableHeaderCell> </DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((row) => {
            const isCommission = row.invoice_kind === "delivery_commission";
            const expanded = expandedDraftId === row.id;

            return (
              <DataTableRow key={row.id}>
                <DataTableCell>{formatTrDate(row.invoice_date)}</DataTableCell>
                <DataTableCell>
                  <span className="font-medium">{row.invoice_number}</span>
                </DataTableCell>
                <DataTableCell>{invoiceCounterpartyLabel(row)}</DataTableCell>
                <DataTableCell>
                  <span
                    className={
                      isCommission
                        ? "text-xs text-primary"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {invoiceKindLabel(row.invoice_kind)}
                  </span>
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.gross_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                  {!readOnly && row.review_reason && (
                    <p className="mt-1 max-w-xs truncate text-xs text-warning">
                      {row.review_reason}
                    </p>
                  )}
                </DataTableCell>
                {!readOnly && (
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
                )}
                <DataTableCell>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs"
                    onClick={() => onToggleExpand(row.id)}
                  >
                    {expanded ? "Hide" : readOnly ? "View" : "Review"}
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
            readOnly={readOnly}
            onUpdated={onUpdated}
          />
        </div>
      )}
    </div>
  );
}

export function InvoicesReviewPanel() {
  const { entityId } = useEntity();
  const { from, to, activeTab, setRange, setActiveTab, listPath } =
    useInvoicesReviewUrl();
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  useEntitySwitchReset(entityId, () => {
    setExpandedDraftId(null);
  });

  const { items, loading, error, reload } = useEntityList<InvoiceDraftListRow>(
    listPath,
    entityId,
  );

  const visibleRows = useMemo(
    () => filterInvoicesByTab(items, activeTab),
    [items, activeTab],
  );

  function toggleExpand(id: string) {
    setExpandedDraftId((current) => (current === id ? null : id));
  }

  function onDraftUpdated(outcome?: "removed" | "updated") {
    void reload();
    invalidateReviewCounts();
    if (outcome === "removed") {
      setExpandedDraftId(null);
    }
  }

  function onTabChange(tab: InvoiceReviewTab) {
    setActiveTab(tab);
    setExpandedDraftId(null);
  }

  function onRangeChange(nextFrom: string, nextTo: string) {
    setRange(nextFrom, nextTo);
    setExpandedDraftId(null);
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  const emptyCopy = invoiceReviewEmptyState(activeTab);
  const isPostedTab = activeTab === "posted";

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {isPostedTab
          ? "Browse posted supplier and commission e-Faturas. These are read-only — open a row to preview the document and jump to the ledger entry."
          : "Uploaded supplier invoices stay here until posted to the ledger. Confirmed invoices must still be posted before they appear in payables. Click Review on a row to expand actions — post, send back to review, discard, or reclassify."}
      </p>

      <div className="mb-6 space-y-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={onRangeChange}
        />

        <div
          className="flex flex-wrap gap-2 border-b border-border pb-2"
          role="tablist"
          aria-label="Invoice status filters"
        >
          {INVOICE_REVIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={isPostedTab ? 7 : 8} />}
      {!loading && visibleRows.length === 0 && (
        <EmptyState
          icon={FileText}
          title={emptyCopy.title}
          hint={emptyCopy.hint}
        />
      )}
      {!loading && visibleRows.length > 0 && (
        <InvoiceDraftTable
          rows={visibleRows}
          expandedDraftId={expandedDraftId}
          onToggleExpand={toggleExpand}
          onUpdated={onDraftUpdated}
          readOnly={isPostedTab}
        />
      )}
    </>
  );
}
