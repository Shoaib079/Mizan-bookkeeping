"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";
import {
  CorrectCustomerPaymentForm,
  type CorrectableCustomerPaymentRow,
} from "@/components/forms/correct-customer-payment-form";
import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { GroupSaleForm } from "@/components/forms/group-sale-form";
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
import { formatFxNative } from "@/lib/fx-money";
import { formatTrDate, formatTry } from "@/lib/money";
import { customerMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
} from "@/lib/ledger-display";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  pax: number | null;
  rate_per_person_kurus: number | null;
  forex_currency: string | null;
  rate_per_person_forex_minor: number | null;
  total_forex_minor: number | null;
  payment_native_quantity: number | null;
  journal_entry_id: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
};

type LedgerResponse = {
  balance_kurus: number;
  entries: LedgerEntry[];
};

function formatLedgerGroupMeta(entry: LedgerEntry): string | null {
  const parts: string[] = [];
  if (entry.pax != null) {
    if (entry.rate_per_person_kurus != null) {
      parts.push(
        `${entry.pax} pax × ${formatTry(entry.rate_per_person_kurus)}`,
      );
    } else {
      parts.push(`${entry.pax} pax`);
    }
  }
  if (
    entry.forex_currency &&
    entry.rate_per_person_forex_minor != null &&
    entry.pax != null
  ) {
    parts.push(
      `${formatFxNative(entry.rate_per_person_forex_minor, entry.forex_currency)}/pax`,
    );
  }
  if (entry.forex_currency && entry.total_forex_minor != null) {
    parts.push(formatFxNative(entry.total_forex_minor, entry.forex_currency));
  }
  if (entry.forex_currency && entry.payment_native_quantity != null) {
    parts.push(
      `${formatFxNative(entry.payment_native_quantity, entry.forex_currency)} received`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { entityId } = useEntity();

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correctPayment, setCorrectPayment] =
    useState<CorrectableCustomerPaymentRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
    description: string;
  } | null>(null);

  const resetDetailState = useCallback(() => {
    setCustomer(null);
    setLedger(null);
    setLoading(true);
    setError(null);
    setEditOpen(false);
    setSaleOpen(false);
    setPaymentOpen(false);
    setCorrectPayment(null);
    setVoidTarget(null);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [cust, led] = await Promise.all([
        apiFetch<CustomerRow>(
          `/entities/${entityId}/customers/${customerId}`,
        ),
        apiFetch<LedgerResponse>(
          `/entities/${entityId}/customers/${customerId}/ledger`,
        ),
      ]);
      setCustomer(cust);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, customerId]);

  useEffect(() => {
    setCorrectPayment(null);
    void reload();
  }, [reload]);

  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(ledger?.entries ?? []);

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
        <p className="text-sm text-muted-foreground">Loading customer…</p>
      )}

      {!loading && customer && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{customer.name}</h1>
              {customer.tax_id && (
                <p className="mt-1 text-sm text-muted-foreground">
                  VKN/TCKN: {customer.tax_id}
                </p>
              )}
              {(customer.contact_name || customer.phone) && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[customer.contact_name, customer.phone].filter(Boolean).join(" · ")}
                </p>
              )}
              {customer.identifier && (
                <p className="mt-1 text-sm text-muted-foreground">
                  ID: {customer.identifier}
                </p>
              )}
              <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              {customer.notes && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {customer.notes}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Receivable balance</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatTry(ledger.balance_kurus)}
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button type="button" onClick={() => setSaleOpen(true)}>
              Group sale
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Ledger</h2>
          <LedgerHistoryToggle
            hiddenCount={hiddenCount}
            showHistory={showHistory}
            onToggle={setShowHistory}
          />
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No current entries — show correction history to see voided rows.
            </p>
          ) : (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Type</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell>Pax / forex</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                  <DataTableHeaderCell>Actions</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {visibleRows.map((entry) => (
                  <DataTableRow
                    key={entry.id}
                    className={subledgerRowClassName(
                      entry.display_kind,
                      showHistory,
                    )}
                  >
                    <DataTableCell>
                      {formatTrDate(entry.movement_date)}
                    </DataTableCell>
                    <DataTableCell>
                      {customerMovementLabels[entry.movement_type] ??
                        entry.movement_type}
                    </DataTableCell>
                    <DataTableCell>
                      {entry.description}
                      {entry.was_corrected && (
                        <span className="ml-2">
                          <EditedBadge />
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-sm text-muted-foreground">
                      {formatLedgerGroupMeta(entry) ?? "—"}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(entry.amount_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {entry.movement_type === "payment" && (
                        <SubledgerRowActions
                          row={entry}
                          onEdit={() =>
                            setCorrectPayment({
                              journal_entry_id: entry.journal_entry_id!,
                              movement_date: entry.movement_date,
                              amount_kurus: entry.amount_kurus,
                              description: entry.description,
                            })
                          }
                          onVoid={() =>
                            setVoidTarget({
                              journal_entry_id: entry.journal_entry_id!,
                              description: entry.description,
                            })
                          }
                        />
                      )}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </>
      )}

      {customer && (
        <>
          <CustomerForm
            open={editOpen}
            customer={customer}
            onClose={() => setEditOpen(false)}
            onSaved={() => void reload()}
          />
          <GroupSaleForm
            open={saleOpen}
            customerId={customerId}
            onClose={() => setSaleOpen(false)}
            onSaved={() => void reload()}
          />
          <CustomerPaymentForm
            open={paymentOpen}
            customerId={customerId}
            balanceKurus={ledger?.balance_kurus}
            onClose={() => setPaymentOpen(false)}
            onSaved={() => void reload()}
          />
          <CorrectCustomerPaymentForm
            open={correctPayment !== null}
            customerId={customerId}
            payment={correctPayment}
            onClose={() => setCorrectPayment(null)}
            onSaved={() => void reload()}
          />
          <VoidSubledgerDialog
            open={voidTarget !== null}
            title="Void customer payment"
            description={voidTarget?.description}
            voidPath={
              entityId && voidTarget
                ? `/entities/${entityId}/customers/${customerId}/payments/${voidTarget.journal_entry_id}/void`
                : null
            }
            onClose={() => setVoidTarget(null)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </>
  );
}
