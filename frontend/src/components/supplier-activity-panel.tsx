"use client";

/** Supplier chronological activity — one timeline + Excel export. */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { SupplierActivityExportButton } from "@/components/supplier-activity-export-button";
import { SupplierActivityRowActions } from "@/components/supplier-activity-row-actions";
import {
  type SupplierActivityRow,
} from "@/components/supplier-activity-types";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch, entityPath } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatSupplierPayableBalance } from "@/lib/supplier-balance";
import { rangedBalanceLabel } from "@/lib/ranged-balance-label";
import { subledgerRowClassName } from "@/lib/ledger-display";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

export type { SupplierActivityRow } from "@/components/supplier-activity-types";

type SupplierActivity = {
  supplier_id: string;
  supplier_name: string;
  supplier_vkn: string;
  from_date: string;
  to_date: string;
  opening_balance_kurus: number;
  closing_balance_kurus: number;
  total_invoices_gross_kurus: number;
  total_payments_kurus: number;
  total_vat_kurus: number;
  rows: SupplierActivityRow[];
};

type Props = {
  supplierId: string;
  /** Controlled activity period — owned by the detail page for the sticker label. */
  range: { from: string; to: string };
  onRangeChange: (from: string, to: string) => void;
  onCorrectPayment?: (row: CorrectableSupplierPaymentRow) => void;
  onEditInvoice?: (row: {
    journal_entry_id: string;
    movement_date: string;
    amount_kurus: number;
    description: string;
    expense_account_id?: string | null;
  }) => void;
};

export function SupplierActivityPanel({
  supplierId,
  range,
  onRangeChange,
  onCorrectPayment,
  onEditInvoice,
}: Props) {
  const { entityId } = useEntity();
  const [previewDraftId, setPreviewDraftId] = useState<string | null>(null);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    description: string;
    kind: "payment" | "invoice";
    void_path: string;
  } | null>(null);

  const alwaysShowActivityRow = useCallback(
    (row: SupplierActivityRow) =>
      row.movement_kind === "opening" ||
      row.movement_kind === "closing" ||
      row.movement_kind === "unposted_invoice",
    [],
  );
  const historyOptions = useMemo(
    () => ({ alwaysShow: alwaysShowActivityRow }),
    [alwaysShowActivityRow],
  );

  const activityEnabled = Boolean(entityId && supplierId);
  const activityQuery = useQuery({
    queryKey: [
      "suppliers",
      entityId,
      supplierId,
      "activity",
      range.from,
      range.to,
    ],
    enabled: activityEnabled,
    queryFn: () =>
      apiFetch<SupplierActivity>(
        `/entities/${entityId}/suppliers/${supplierId}/activity?from_date=${range.from}&to_date=${range.to}`,
      ),
  });

  const data = activityQuery.data ?? null;
  const loading = activityQuery.isPending;
  const error =
    activityQuery.error instanceof Error ? activityQuery.error.message : null;

  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(data?.rows ?? [], historyOptions);

  const reload = useCallback(async () => {
    await activityQuery.refetch();
  }, [activityQuery.refetch]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={!entityId || loading}
          onChange={(from, to) => onRangeChange(from, to)}
        />
        <SupplierActivityExportButton
          entityId={entityId}
          supplierId={supplierId}
          from={range.from}
          to={range.to}
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <PageSkeleton when={loading} />

      {data && (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Opening</dt>
              <dd className="tabular-nums font-medium">
                {formatTry(data.opening_balance_kurus)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Invoices (gross)</dt>
              <dd className="tabular-nums font-medium">
                {formatTry(data.total_invoices_gross_kurus)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payments</dt>
              <dd className="tabular-nums font-medium">
                {formatTry(data.total_payments_kurus)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {rangedBalanceLabel({
                  rangeTo: range.to,
                  currentLabel: "Closing",
                })}
              </dt>
              <dd className="tabular-nums font-medium">
                {formatTry(data.closing_balance_kurus)}
              </dd>
            </div>
          </dl>

          <LedgerHistoryToggle
            hiddenCount={hiddenCount}
            showHistory={showHistory}
            onToggle={setShowHistory}
          />

          <DataTable wide>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>Type</DataTableHeaderCell>
                {/* "Ref" said nothing: on an invoice row this column holds
                    the supplier's invoice number, which is what anyone
                    matching a statement is actually looking for. Payments
                    keep their dekont number, and the header says so. */}
                <DataTableHeaderCell>Invoice / dekont no.</DataTableHeaderCell>
                <DataTableHeaderCell>Detail</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
                <DataTableHeaderCell align="right">KDV</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                <DataTableHeaderCell>Bank</DataTableHeaderCell>
                <DataTableHeaderCell>Dekont</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
                <DataTableHeaderCell>Doc</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {visibleRows.map((row, index) => (
                <DataTableRow
                  key={`${row.movement_date}-${row.movement_kind}-${index}`}
                  className={subledgerRowClassName(row.display_kind)}
                >
                  <DataTableCell>{formatTrDate(row.movement_date)}</DataTableCell>
                  <DataTableCell>{row.movement_label}</DataTableCell>
                  <DataTableCell>{row.document_ref}</DataTableCell>
                  <DataTableCell
                    className={
                      !row.affects_balance || row.movement_label === "İptal"
                        ? "italic text-muted-foreground"
                        : undefined
                    }
                  >
                    {row.detail}
                    {row.was_corrected && (
                      <span className="ml-2 not-italic">
                        <EditedBadge />
                      </span>
                    )}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {row.net_kurus != null ? formatTry(row.net_kurus) : "—"}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {row.vat_kurus != null ? formatTry(row.vat_kurus) : "—"}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {row.amount_kurus != null ? formatTry(row.amount_kurus) : "—"}
                  </DataTableCell>
                  <DataTableCell>{row.bank_name ?? "—"}</DataTableCell>
                  <DataTableCell>{row.dekont_ref ?? "—"}</DataTableCell>
                  <DataTableCell align="right">
                    {formatSupplierPayableBalance(row.balance_kurus)}
                  </DataTableCell>
                  <DataTableCell>
                    {row.has_document && row.invoice_draft_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() =>
                          setPreviewDraftId(
                            previewDraftId === row.invoice_draft_id
                              ? null
                              : row.invoice_draft_id,
                          )
                        }
                      >
                        {previewDraftId === row.invoice_draft_id
                          ? "Hide"
                          : "View"}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    <SupplierActivityRowActions
                      row={row}
                      onCorrectPayment={onCorrectPayment}
                      onEditInvoice={onEditInvoice}
                      onVoid={setVoidTarget}
                    />
                    {row.invoice_draft_id &&
                      row.movement_kind === "unposted_invoice" && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() =>
                            setReviewDraftId(
                              reviewDraftId === row.invoice_draft_id
                                ? null
                                : row.invoice_draft_id,
                            )
                          }
                        >
                          {reviewDraftId === row.invoice_draft_id
                            ? "Hide"
                            : "Review"}
                        </Button>
                      )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>

          {previewDraftId && (
            <div className="rounded-lg border border-border bg-card p-4">
              <InvoiceDocumentPreview draftId={previewDraftId} />
            </div>
          )}

          {reviewDraftId && (
            <div className="rounded-lg border border-border bg-card p-4">
              <InvoiceDraftReview
                key={reviewDraftId}
                draftId={reviewDraftId}
                embedded
                onUpdated={(outcome) => {
                  void reload();
                  if (outcome === "removed") {
                    setReviewDraftId(null);
                  }
                }}
              />
            </div>
          )}

          <VoidSubledgerDialog
            open={voidTarget !== null}
            title={
              voidTarget?.kind === "invoice"
                ? "Void supplier invoice"
                : "Void supplier payment"
            }
            description={voidTarget?.description}
            voidPath={
              entityId && voidTarget
                ? entityPath(entityId, voidTarget.void_path)
                : null
            }
            onClose={() => setVoidTarget(null)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </section>
  );
}
