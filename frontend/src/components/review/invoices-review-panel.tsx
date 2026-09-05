"use client";

import { useMemo, useState } from "react";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { Dialog } from "@/components/ui/dialog";
import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { FilterChips } from "@/components/page/filter-chips";
import { ListPage } from "@/components/page/list-page";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
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
  invoiceReviewTabUsesRange,
  type InvoiceDraftListRow,
  type InvoiceReviewTab,
} from "@/lib/invoice-draft-list";
import { useEntityList } from "@/lib/use-entity-list";
import { useInvoicesReviewUrl } from "@/lib/use-invoices-review-url";

/** The same list on a phone.
 *
 * The table has eight columns; on a 375px screen the counterparty alone wrapped
 * to seven lines and everything past it was pushed off the edge. A card leads
 * with who the invoice is from and what it costs — the two things you are
 * looking for when reviewing — and puts date, number and status underneath.
 *
 * Tapping the card is the Review button: on a phone the whole row is the
 * target, so a separate 32px button beside it would be the wrong shape.
 */
function InvoiceDraftCards({
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
      <MobileCardList>
        {rows.map((row) => (
          <MobileCardRow
            key={row.id}
            onClick={() => onToggleExpand(row.id)}
            title={invoiceCounterpartyLabel(row)}
            amount={formatTry(row.gross_kurus)}
            amountNote={expandedDraftId === row.id ? "Hide" : undefined}
            meta={
              <>
                <span>{formatTrDate(row.invoice_date)}</span>
                <span className="truncate">{row.invoice_number}</span>
                <StatusBadge status={row.status} />
              </>
            }
          />
        ))}
      </MobileCardList>

      <Dialog
        open={expandedDraftId !== null}
        title="Review invoice"
        size="wide"
        onClose={() => expandedDraftId && onToggleExpand(expandedDraftId)}
      >
        {expandedDraftId && (
          <InvoiceDraftReview
            key={expandedDraftId}
            draftId={expandedDraftId}
            embedded
            readOnly={readOnly}
            onUpdated={onUpdated}
          />
        )}
      </Dialog>
    </div>
  );
}

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
      <DataTable wide>
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

      {/* A dialog, not a panel appended under the table. Expanded inline, the
          review opened *below* every row on the page — on a long list that
          meant scrolling past forty invoices to reach the one just clicked,
          with nothing on screen to say it had opened at all. */}
      <Dialog
        open={expandedDraftId !== null}
        title="Review invoice"
        size="wide"
        onClose={() => expandedDraftId && onToggleExpand(expandedDraftId)}
      >
        {expandedDraftId && (
          <InvoiceDraftReview
            key={expandedDraftId}
            draftId={expandedDraftId}
            embedded
            readOnly={readOnly}
            onUpdated={onUpdated}
          />
        )}
      </Dialog>
    </div>
  );
}

export function InvoicesReviewPanel() {
  const { entityId } = useEntity();
  const { from, to, activeTab, setRange, setActiveTab, listPath } =
    useInvoicesReviewUrl();
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);


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
    <ListPage
      title="Invoices to review"
      hideTitleOnDesktop
      meta={
        isPostedTab
          ? "Browse posted supplier and commission e-Faturas. These are read-only — open a row to preview the document and jump to the ledger entry."
          : "Uploaded supplier invoices stay here until posted to the ledger. Confirmed invoices must still be posted before they appear in payables. Click Review on a row to expand actions — post, send back to review, discard, or reclassify."
      }
      loading={loading}
      error={error}
      toolbar={
        // Shown only where it applies. The queues ignore the range now, and a
        // date picker that changes nothing is worse than none: it was the
        // first thing anyone reached for when an invoice seemed missing, and
        // it was never the reason.
        invoiceReviewTabUsesRange(activeTab) ? (
          <ReportDateRange
            from={from}
            to={to}
            disabled={loading}
            onChange={onRangeChange}
          />
        ) : undefined
      }
      filters={
        <FilterChips
          chips={INVOICE_REVIEW_TABS}
          value={activeTab}
          onChange={onTabChange}
          ariaLabel="Invoice status filters"
        />
      }
      skeletonColumns={isPostedTab ? 7 : 8}
      isEmpty={visibleRows.length === 0}
      empty={
        <EmptyState
          icon={FileText}
          title={emptyCopy.title}
          hint={emptyCopy.hint}
        />
      }
      mobile={
        <InvoiceDraftCards
          rows={visibleRows}
          expandedDraftId={expandedDraftId}
          onToggleExpand={toggleExpand}
          onUpdated={onDraftUpdated}
          readOnly={isPostedTab}
        />
      }
      table={
        <InvoiceDraftTable
          rows={visibleRows}
          expandedDraftId={expandedDraftId}
          onToggleExpand={toggleExpand}
          onUpdated={onDraftUpdated}
          readOnly={isPostedTab}
        />
      }
    />
  );
}
