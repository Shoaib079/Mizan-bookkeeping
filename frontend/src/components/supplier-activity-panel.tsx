"use client";

/** Supplier chronological activity — one timeline + Excel export. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { ReportDateRange } from "@/components/reports/report-date-range";
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
import {
  apiDownload,
  apiFetch,
  triggerBlobDownload,
} from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatSupplierPayableBalance } from "@/lib/supplier-balance";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
} from "@/lib/ledger-display";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

export type SupplierActivityRow = {
  movement_date: string;
  movement_kind: string;
  movement_label: string;
  document_ref: string;
  detail: string;
  net_kurus: number | null;
  vat_kurus: number | null;
  amount_kurus: number | null;
  bank_name: string | null;
  dekont_ref: string | null;
  balance_kurus: number;
  affects_balance: boolean;
  invoice_draft_id: string | null;
  journal_entry_id: string | null;
  has_document: boolean;
  can_edit: boolean;
  expense_account_id: string | null;
  payment_account_id: string | null;
  display_kind?: SubledgerDisplayKind;
  was_corrected?: boolean;
};

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
  onCorrectPayment,
  onEditInvoice,
}: Props) {
  const { entityId } = useEntity();
  const [range, setRange] = useState(currentMonthRange);
  const [data, setData] = useState<SupplierActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDraftId, setPreviewDraftId] = useState<string | null>(null);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
    description: string;
    kind: "payment" | "invoice";
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
  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(data?.rows ?? [], historyOptions);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SupplierActivity>(
        `/entities/${entityId}/suppliers/${supplierId}/activity?from_date=${range.from}&to_date=${range.to}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, supplierId, range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onExport() {
    if (!entityId) return;
    setExporting(true);
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/suppliers/${supplierId}/activity/export?from_date=${range.from}&to_date=${range.to}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={!entityId || loading}
          onChange={(from, to) => setRange({ from, to })}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!entityId || exporting || loading}
          onClick={() => void onExport()}
        >
          {exporting ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

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
              <dt className="text-muted-foreground">Closing (posted)</dt>
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

          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>Type</DataTableHeaderCell>
                <DataTableHeaderCell>Ref</DataTableHeaderCell>
                <DataTableHeaderCell>Detail</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
                <DataTableHeaderCell align="right">KDV</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                <DataTableHeaderCell>Bank</DataTableHeaderCell>
                <DataTableHeaderCell>Dekont</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
                <DataTableHeaderCell>Doc</DataTableHeaderCell>
                <DataTableHeaderCell>Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {visibleRows.map((row, index) => (
                <DataTableRow
                  key={`${row.movement_date}-${row.movement_kind}-${index}`}
                  className={subledgerRowClassName(
                    row.display_kind,
                    showHistory,
                  )}
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
                        variant="secondary"
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
                  <DataTableCell align="right">
                    {row.movement_kind === "payment" && onCorrectPayment && (
                      <SubledgerRowActions
                        row={row}
                        onEdit={() =>
                          onCorrectPayment({
                            journal_entry_id: row.journal_entry_id!,
                            movement_date: row.movement_date,
                            amount_kurus: row.amount_kurus ?? 0,
                            description: row.detail,
                            payment_account_id: row.payment_account_id,
                          })
                        }
                        onVoid={() =>
                          setVoidTarget({
                            journal_entry_id: row.journal_entry_id!,
                            description: row.detail,
                            kind: "payment",
                          })
                        }
                      />
                    )}
                    {row.movement_kind === "invoice" &&
                      row.can_edit &&
                      onEditInvoice && (
                        <SubledgerRowActions
                          row={row}
                          onEdit={() =>
                            onEditInvoice({
                              journal_entry_id: row.journal_entry_id!,
                              movement_date: row.movement_date,
                              amount_kurus: row.amount_kurus ?? 0,
                              description: row.detail,
                              expense_account_id: row.expense_account_id,
                            })
                          }
                          onVoid={() =>
                            setVoidTarget({
                              journal_entry_id: row.journal_entry_id!,
                              description: row.detail,
                              kind: "invoice",
                            })
                          }
                        />
                      )}
                    {row.invoice_draft_id &&
                      row.movement_kind === "unposted_invoice" && (
                        <Button
                          type="button"
                          variant="secondary"
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
                ? voidTarget.kind === "invoice"
                  ? `/entities/${entityId}/suppliers/${supplierId}/invoices/${voidTarget.journal_entry_id}/void`
                  : `/entities/${entityId}/suppliers/${supplierId}/payments/${voidTarget.journal_entry_id}/void`
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
