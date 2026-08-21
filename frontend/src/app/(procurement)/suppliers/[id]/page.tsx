"use client";

/** Supplier detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  CorrectSupplierPaymentForm,
  type CorrectableSupplierPaymentRow,
} from "@/components/forms/correct-supplier-payment-form";
import {
  CorrectSupplierInvoiceForm,
  type CorrectableSupplierInvoiceRow,
} from "@/components/forms/correct-supplier-invoice-form";
import { SupplierForm, type SupplierRow } from "@/components/forms/supplier-form";
import { SupplierPaymentForm } from "@/components/forms/supplier-payment-form";
import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { SupplierActivityPanel } from "@/components/supplier-activity-panel";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { supplierBalanceHeading } from "@/lib/supplier-balance";
import {
  isInvoiceWorkbenchStatus,
  isPendingReviewStatus,
  isReadyToPostInvoiceStatus,
} from "@/lib/review-status";

type SupplierLedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  journal_entry_id: string | null;
};

type SupplierLedgerResponse = {
  balance_kurus: number;
  entries: SupplierLedgerEntry[];
};

type DraftRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  gross_kurus: number;
  status: string;
  supplier_id: string | null;
  supplier_vkn: string | null;
};

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supplierId = params.id;
  const highlightDraftId = searchParams.get("draft");

  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correctPayment, setCorrectPayment] =
    useState<CorrectableSupplierPaymentRow | null>(null);
  const [correctInvoice, setCorrectInvoice] =
    useState<CorrectableSupplierInvoiceRow | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(
    highlightDraftId,
  );
  /** Activity from/to — drives the sticker's current vs closing-in-range label. */
  const [activityRange, setActivityRange] = useState(currentMonthRange);

  const detailEnabled = Boolean(entityId && supplierId);

  const supplierQuery = useQuery({
    queryKey: ["suppliers", entityId, supplierId],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<SupplierRow>(`/entities/${entityId}/suppliers/${supplierId}`),
  });
  const ledgerQuery = useQuery({
    queryKey: ["suppliers", entityId, supplierId, "ledger"],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<SupplierLedgerResponse>(
        `/entities/${entityId}/suppliers/${supplierId}/ledger`,
      ),
  });
  const draftsQuery = useQuery({
    queryKey: ["suppliers", entityId, supplierId, "drafts"],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<{ items: DraftRow[] }>(
        `/entities/${entityId}/invoices/drafts?limit=200`,
      ),
  });

  const supplier = supplierQuery.data ?? null;
  const ledger = ledgerQuery.data ?? null;
  const drafts = (draftsQuery.data?.items ?? [])
    .filter((d) => isInvoiceWorkbenchStatus(d.status))
    .filter(
      (d) =>
        d.supplier_id === supplierId ||
        (!d.supplier_id &&
          Boolean(supplier?.vkn) &&
          d.supplier_vkn === supplier?.vkn),
    );
  const loading =
    supplierQuery.isPending || ledgerQuery.isPending || draftsQuery.isPending;
  const error =
    supplierQuery.error instanceof Error
      ? supplierQuery.error.message
      : ledgerQuery.error instanceof Error
        ? ledgerQuery.error.message
        : draftsQuery.error instanceof Error
          ? draftsQuery.error.message
          : null;

  const reload = useCallback(async () => {
    await Promise.all([
      supplierQuery.refetch(),
      ledgerQuery.refetch(),
      draftsQuery.refetch(),
    ]);
  }, [supplierQuery.refetch, ledgerQuery.refetch, draftsQuery.refetch]);

  useEffect(() => {
    setCorrectPayment(null);
  }, [supplierId]);

  function handleDraftUpdated(outcome?: "removed" | "updated") {
    void reload();
    if (outcome === "removed") {
      setExpandedDraftId(null);
      if (highlightDraftId) {
        router.replace(`/suppliers/${supplierId}`);
      }
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  const awaiting = drafts.filter((d) => isPendingReviewStatus(d.status));
  const readyToPost = drafts.filter((d) => isReadyToPostInvoiceStatus(d.status));

  const invoiceCountParts: string[] = [];
  if (awaiting.length > 0) {
    invoiceCountParts.push(
      `${awaiting.length} awaiting review`,
    );
  }
  if (readyToPost.length > 0) {
    invoiceCountParts.push(
      `${readyToPost.length} confirmed, not yet posted`,
    );
  }

  return (
    <EntityDetailPage
      title={supplier?.name ?? "Supplier"}
      loading={loading}
      error={error}
      meta={
        supplier && (
          <MetaFacts
            items={[
              <StatusBadge
                key="status"
                status={supplier.is_active ? "active" : "inactive"}
              />,
              `VKN ${supplier.vkn}`,
              supplier.iban,
              supplier.auto_post_payments && "Auto-posts payments",
              supplier.notes,
            ].filter(Boolean)}
          />
        )
      }
      primaryAction={
        showWrite ? (
          <Button onClick={() => setPaymentOpen(true)}>Record payment</Button>
        ) : undefined
      }
      actions={
        <>
          <Link href="/record">
            <Button type="button" variant="secondary">
              Upload invoice
            </Button>
          </Link>
          <SubledgerDownloadMenu
            basePath={
              entityId && supplierId
                ? `/entities/${entityId}/suppliers/${supplierId}/ledger`
                : null
            }
          />
        </>
      }
      titleAction={
        showWrite ? (
          <EditTitleButton onClick={() => setEditOpen(true)} />
        ) : undefined
      }
      balance={
        ledger && (
          <EntityBalanceSticker
            label={supplierBalanceHeading(ledger.balance_kurus)}
            caption="Current balance"
            signedBalanceMinor={ledger.balance_kurus}
            details={
              invoiceCountParts.length > 0 ? (
                <p>{invoiceCountParts.join(" · ")}</p>
              ) : undefined
            }
          />
        )
      }
      activity={
        <div className="space-y-8">
          {highlightDraftId && (
            <DetailSection title="Review uploaded invoice">
              <div className="rounded-lg border border-border bg-card p-4">
                <InvoiceDraftReview
                  draftId={highlightDraftId}
                  embedded
                  onUpdated={handleDraftUpdated}
                />
              </div>
            </DetailSection>
          )}

          <DetailSection title="Activity">
            <SupplierActivityPanel
              supplierId={supplierId}
              range={activityRange}
              onRangeChange={(from, to) => setActivityRange({ from, to })}
              onCorrectPayment={(row) => setCorrectPayment(row)}
              onEditInvoice={(row) => setCorrectInvoice(row)}
            />
          </DetailSection>

          <DetailSection title="Invoice drafts">
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No uploaded invoices for this supplier.{" "}
                <Link href="/record" className="text-primary hover:underline">
                  Upload an e-Fatura
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-border bg-card"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50"
                      onClick={() =>
                        setExpandedDraftId((id) =>
                          id === draft.id ? null : draft.id,
                        )
                      }
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {draft.invoice_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTrDate(draft.invoice_date)} ·{" "}
                          {formatTry(draft.gross_kurus)}
                        </p>
                      </div>
                      <StatusBadge status={draft.status} />
                    </button>
                    {expandedDraftId === draft.id && (
                      <div className="border-t border-border p-4">
                        <InvoiceDraftReview
                          draftId={draft.id}
                          embedded
                          onUpdated={handleDraftUpdated}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      }
    >
      <SupplierForm
        open={editOpen}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSaved={() => void reload()}
      />
      <SupplierPaymentForm
        open={paymentOpen}
        supplierId={supplierId}
        balanceKurus={ledger?.balance_kurus}
        onClose={() => setPaymentOpen(false)}
        onPaid={() => void reload()}
      />
      <CorrectSupplierPaymentForm
        open={correctPayment !== null}
        supplierId={supplierId}
        payment={correctPayment}
        onClose={() => setCorrectPayment(null)}
        onSaved={() => void reload()}
      />
      <CorrectSupplierInvoiceForm
        open={correctInvoice !== null}
        supplierId={supplierId}
        invoice={correctInvoice}
        onClose={() => setCorrectInvoice(null)}
        onSaved={() => void reload()}
      />
    </EntityDetailPage>
  );
}
