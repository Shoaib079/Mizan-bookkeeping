"use client";

/** Supplier detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
import { MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure, SummaryPanel } from "@/components/page/summary-panel";
import { SupplierActivityPanel } from "@/components/supplier-activity-panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import { isSupplierAdvanceBalance } from "@/lib/supplier-balance";
import {
  isInvoiceWorkbenchStatus,
  isPendingReviewStatus,
  isReadyToPostInvoiceStatus,
} from "@/lib/review-status";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  journal_entry_id: string | null;
};

type LedgerResponse = {
  balance_kurus: number;
  entries: LedgerEntry[];
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
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correctPayment, setCorrectPayment] =
    useState<CorrectableSupplierPaymentRow | null>(null);
  const [correctInvoice, setCorrectInvoice] =
    useState<CorrectableSupplierInvoiceRow | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(
    highlightDraftId,
  );

  const resetDetailState = useCallback(() => {
    setSupplier(null);
    setLedger(null);
    setDrafts([]);
    setLoading(true);
    setError(null);
    setEditOpen(false);
    setPaymentOpen(false);
    setCorrectPayment(null);
    setCorrectInvoice(null);
    setExpandedDraftId(null);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const [sup, led, draftRes] = await Promise.all([
        apiFetch<SupplierRow>(
          `/entities/${entityId}/suppliers/${supplierId}`,
        ),
        apiFetch<LedgerResponse>(
          `/entities/${entityId}/suppliers/${supplierId}/ledger`,
        ),
        apiFetch<{ items: DraftRow[] }>(
          `/entities/${entityId}/invoices/drafts?limit=200`,
        ),
      ]);
      setSupplier(sup);
      setLedger(led);
      const forSupplier = draftRes.items
        .filter((d) => isInvoiceWorkbenchStatus(d.status))
        .filter(
          (d) =>
            d.supplier_id === supplierId ||
            (!d.supplier_id &&
              d.supplier_vkn &&
              d.supplier_vkn === sup.vkn),
        );
      setDrafts(forSupplier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, supplierId]);

  useEffect(() => {
    setCorrectPayment(null);
    void reload();
  }, [reload]);

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

  const isAdvance = isSupplierAdvanceBalance(ledger?.balance_kurus ?? 0);
  const awaiting = drafts.filter((d) => isPendingReviewStatus(d.status));
  const readyToPost = drafts.filter((d) => isReadyToPostInvoiceStatus(d.status));
  const sumGross = (rows: DraftRow[]) =>
    rows.reduce((total, row) => total + row.gross_kurus, 0);

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
        <Button onClick={() => setPaymentOpen(true)}>Record payment</Button>
      }
      actions={
        <Link href="/record">
          <Button type="button" variant="secondary">
            Upload invoice
          </Button>
        </Link>
      }
      overflowActions={[
        { label: "Edit supplier", onSelect: () => setEditOpen(true) },
      ]}
      headline={
        ledger && (
          <HeadlineFigure
            label={isAdvance ? "Supplier advance" : "Payable balance"}
            amountKurus={Math.abs(ledger.balance_kurus)}
            caption={
              isAdvance
                ? "Paid ahead — invoice still pending"
                : "Owed to this supplier"
            }
          />
        )
      }
      panels={
        drafts.length > 0 && (
          <SummaryPanel
            title="Uploaded invoices"
            lines={[
              {
                label: "Awaiting review",
                hint: `${awaiting.length}`,
                amountKurus: sumGross(awaiting),
                hideWhenZero: true,
              },
              {
                label: "Confirmed, not yet posted",
                hint: `${readyToPost.length}`,
                amountKurus: sumGross(readyToPost),
                hideWhenZero: true,
              },
            ]}
            footnote={
              readyToPost.length > 0
                ? "Confirmed invoices only join the payable balance once posted to the ledger."
                : undefined
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
