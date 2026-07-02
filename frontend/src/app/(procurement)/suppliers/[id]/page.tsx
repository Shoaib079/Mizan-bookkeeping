"use client";

/** Supplier detail — ledger, drafts, payment — Phase 9 Slice 3. */

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
import { SupplierActivityPanel } from "@/components/supplier-activity-panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import { isInvoiceWorkbenchStatus, isReadyToPostInvoiceStatus } from "@/lib/review-status";

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
      <>
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </>
    );
  }

  return (
    <>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading supplier…</p>
      )}

      {!loading && supplier && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{supplier.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                VKN {supplier.vkn}
                {supplier.iban && ` · ${supplier.iban}`}
              </p>
              {supplier.notes && (
                <p className="mt-1 text-sm">{supplier.notes}</p>
              )}
              <div className="mt-2">
                <StatusBadge
                  status={supplier.is_active ? "active" : "inactive"}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              <Link
                href="/record"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                Upload via Record
              </Link>
              <Button onClick={() => setPaymentOpen(true)}>
                Record payment
              </Button>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Payable balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatTry(ledger.balance_kurus)}
            </p>
            {ledger.balance_kurus === 0 &&
              drafts.some((d) => isReadyToPostInvoiceStatus(d.status)) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Confirmed invoices are not in payables until you post them to
                  the ledger — see Invoice drafts below or{" "}
                  <Link
                    href="/review/invoices"
                    className="text-primary hover:underline"
                  >
                    Review → Invoices
                  </Link>
                  .
                </p>
              )}
          </div>

          {highlightDraftId && (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Review uploaded invoice</h2>
              <InvoiceDraftReview
                draftId={highlightDraftId}
                embedded
                onUpdated={handleDraftUpdated}
              />
            </div>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold">Activity</h2>
            <SupplierActivityPanel
              supplierId={supplierId}
              onCorrectPayment={(row) => setCorrectPayment(row)}
              onCorrectInvoice={(row) => setCorrectInvoice(row)}
            />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold">Invoice drafts</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Uploaded e-Faturas for this supplier — confirm, then post to
              ledger to add to the balance above.
            </p>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invoice drafts for this supplier.
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
          </section>
        </>
      )}

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
    </>
  );
}
