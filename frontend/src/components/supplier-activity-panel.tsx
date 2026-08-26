"use client";

/** Supplier chronological activity — one timeline + Excel export. */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { SupplierActivityExportButton } from "@/components/supplier-activity-export-button";
import { SupplierActivityMobileCards } from "@/components/supplier-activity-mobile-cards";
import { SupplierActivityTable } from "@/components/supplier-activity-table";
import {
  type SupplierActivityRow,
} from "@/components/supplier-activity-types";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch, entityPath } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { rangedBalanceLabel } from "@/lib/ranged-balance-label";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
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
  const isMobile = useIsMobileShell();
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
  }, [activityQuery]);

  const rowListProps = {
    rows: visibleRows,
    previewDraftId,
    reviewDraftId,
    onPreviewDraft: setPreviewDraftId,
    onReviewDraft: setReviewDraftId,
    onCorrectPayment,
    onEditInvoice,
    onVoid: setVoidTarget,
  };

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

          {isMobile ? (
            <SupplierActivityMobileCards {...rowListProps} />
          ) : (
            <SupplierActivityTable {...rowListProps} />
          )}

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
