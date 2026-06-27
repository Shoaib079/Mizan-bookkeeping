"use client";

/** Supplier detail — ledger, drafts, payment — Phase 9 Slice 3. */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
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
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";

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
};

const movementLabels: Record<string, string> = {
  opening_balance: "Opening balance",
  invoice: "Invoice",
  payment: "Payment",
  adjustment: "Adjustment",
};

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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
  const [uploadOpen, setUploadOpen] = useState(false);
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
    setUploadOpen(false);
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
          `/entities/${entityId}/invoices/drafts?supplier_id=${supplierId}&limit=50`,
        ),
      ]);
      setSupplier(sup);
      setLedger(led);
      setDrafts(draftRes.items);
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
      <div className="mb-4">
        <Link
          href="/suppliers"
          className="text-sm text-primary hover:underline"
        >
          ← All suppliers
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading supplier…</p>
      )}

      {!loading && supplier && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
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
              <Button variant="secondary" onClick={() => setUploadOpen(true)}>
                Upload e-Fatura
              </Button>
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
          </div>

          {highlightDraftId && (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Review uploaded invoice</h2>
              <InvoiceDraftReview
                draftId={highlightDraftId}
                onUpdated={() => void reload()}
              />
            </div>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold">Ledger</h2>
            {ledger.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No movements yet.
              </p>
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell>Type</DataTableHeaderCell>
                    <DataTableHeaderCell>Description</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                    <DataTableHeaderCell>Actions</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {ledger.entries.map((row) => (
                    <DataTableRow key={row.id}>
                      <DataTableCell>
                        {formatTrDate(row.movement_date)}
                      </DataTableCell>
                      <DataTableCell>
                        {movementLabels[row.movement_type] ??
                          row.movement_type}
                      </DataTableCell>
                      <DataTableCell>{row.description}</DataTableCell>
                      <DataTableCell align="right">
                        {formatTry(row.amount_kurus)}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {row.movement_type === "invoice" &&
                          row.journal_entry_id && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 px-2"
                              onClick={() =>
                                setCorrectInvoice({
                                  journal_entry_id: row.journal_entry_id!,
                                  movement_date: row.movement_date,
                                  amount_kurus: row.amount_kurus,
                                  description: row.description,
                                })
                              }
                            >
                              Correct
                            </Button>
                          )}
                        {row.movement_type === "payment" &&
                          row.journal_entry_id && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 px-2"
                              onClick={() =>
                                setCorrectPayment({
                                  journal_entry_id: row.journal_entry_id!,
                                  movement_date: row.movement_date,
                                  amount_kurus: row.amount_kurus,
                                  description: row.description,
                                })
                              }
                            >
                              Correct
                            </Button>
                          )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Invoice drafts</h2>
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
                          onUpdated={() => void reload()}
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
      <EfaturaUploadForm
        open={uploadOpen}
        supplierId={supplierId}
        onClose={() => setUploadOpen(false)}
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
