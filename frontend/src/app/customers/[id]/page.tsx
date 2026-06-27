"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CustomerCreditSaleForm } from "@/components/forms/customer-credit-sale-form";
import {
  CorrectCustomerPaymentForm,
  type CorrectableCustomerPaymentRow,
} from "@/components/forms/correct-customer-payment-form";
import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { AppShell } from "@/components/layout/app-shell";
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
import { formatTrDate, formatTry } from "@/lib/money";
import { customerMovementLabels } from "@/lib/subledger-labels";

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

  if (!entityId) {
    return (
      <AppShell title="Customer">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={customer?.name ?? "Customer"}>
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-primary hover:underline">
          ← Customers
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading customer…</p>
      )}

      {customer && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              {customer.identifier && (
                <p className="text-sm text-muted-foreground">
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
              Credit sale
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Ledger</h2>
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
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
                {ledger.entries.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell>
                      {formatTrDate(entry.movement_date)}
                    </DataTableCell>
                    <DataTableCell>
                      {customerMovementLabels[entry.movement_type] ??
                        entry.movement_type}
                    </DataTableCell>
                    <DataTableCell>{entry.description}</DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(entry.amount_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {entry.movement_type === "payment" &&
                        entry.journal_entry_id && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-8 px-2"
                            onClick={() =>
                              setCorrectPayment({
                                journal_entry_id: entry.journal_entry_id!,
                                movement_date: entry.movement_date,
                                amount_kurus: entry.amount_kurus,
                                description: entry.description,
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
          <CustomerCreditSaleForm
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
        </>
      )}
    </AppShell>
  );
}
