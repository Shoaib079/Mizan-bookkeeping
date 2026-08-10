"use client";

/** Customer detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import {
  CorrectCustomerPaymentForm,
  type CorrectableCustomerPaymentRow,
} from "@/components/forms/correct-customer-payment-form";
import {
  CorrectCreditSaleForm,
  type CorrectableCreditSaleRow,
} from "@/components/forms/correct-credit-sale-form";
import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { GroupSaleEditLoader } from "@/components/forms/group-sale-edit-loader";
import { GroupSaleForm } from "@/components/forms/group-sale-form";
import {
  CustomerWriteOffDialog,
  type CorrectableWriteOffRow,
} from "@/components/forms/customer-write-off-dialog";
import { Button } from "@/components/ui/button";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatForexBalanceSummary, formatFxNative } from "@/lib/fx-money";
import { formatTrDate, formatTry } from "@/lib/money";
import { customerMovementLabels } from "@/lib/subledger-labels";
import { customerLedgerRowActions } from "@/lib/subledger-actions";
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
  reference_type: string | null;
  reference_id: string | null;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
};

type ForexOutstanding = { currency: string; minor: number };

type LedgerResponse = {
  balance_kurus: number;
  /** One line per currency still owed. Empty when only ever billed in lira. */
  outstanding_by_currency?: ForexOutstanding[];
  entries: LedgerEntry[];
};

/** The rows on a customer ledger that can be undone, and where to send it.
 *
 * A lookup rather than a chain of ternaries: there were two kinds and a
 * nested conditional was already hard to read; the write-off made three. Each
 * entry pairs the dialog's wording with the API path segment, so the two
 * cannot drift into saying different things about the same row.
 */
const VOIDABLE_ROWS = {
  payment: {
    title: "Void customer payment",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/payments/${id}/void`,
  },
  credit_sale: {
    title: "Void credit sale",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/credit-sales/${id}/void`,
  },
  write_off: {
    title: "Void receivable write-off",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/write-offs/${id}/void`,
  },
  // A group sale is not voided through the customer at all — it is its own
  // record, and the route is keyed by the sale rather than the journal entry.
  // That is why this is a path builder now and not a segment: a shared prefix
  // held while every row was customer-scoped, and this row is not.
  group_sale: {
    title: "Void group sale",
    path: (_customerId: string, saleId: string) =>
      `group-sales/${saleId}/void`,
  },
} as const;

type VoidableRowKind = keyof typeof VOIDABLE_ROWS;

/** "Owed: $94.00 · Paid ahead: €12.00", or null when forex is settled.
 *
 * A currency the customer has overpaid comes back negative; it is labelled
 * rather than printed with a minus, because "Owed: -$298.00" makes the reader
 * work out the sign and looks like a fault even when it is not one. */
function formatForexOutstanding(
  outstanding: ForexOutstanding[] | undefined,
): string | null {
  return formatForexBalanceSummary(outstanding);
}

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
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [correctWriteOff, setCorrectWriteOff] =
    useState<CorrectableWriteOffRow | null>(null);
  const [correctPayment, setCorrectPayment] =
    useState<CorrectableCustomerPaymentRow | null>(null);
  const [correctCreditSale, setCorrectCreditSale] =
    useState<CorrectableCreditSaleRow | null>(null);
  const [groupSaleEditId, setGroupSaleEditId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
    description: string;
    kind: VoidableRowKind;
  } | null>(null);

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
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <EntityDetailPage
      title={customer?.name ?? "Customer"}
      loading={loading}
      error={error}
      meta={
        customer && (
          <MetaFacts
            items={[
              <StatusBadge
                key="status"
                status={customer.is_active ? "active" : "inactive"}
              />,
              customer.tax_id && `VKN/TCKN ${customer.tax_id}`,
              customer.contact_name,
              customer.phone,
              customer.identifier && `ID ${customer.identifier}`,
              customer.notes,
            ].filter(Boolean)}
          />
        )
      }
      primaryAction={
        <Button type="button" onClick={() => setPaymentOpen(true)}>
          Record payment
        </Button>
      }
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSaleOpen(true)}
          >
            Group sale
          </Button>
          <SubledgerDownloadMenu
            basePath={
              entityId && customerId
                ? `/entities/${entityId}/customers/${customerId}/ledger`
                : null
            }
          />
        </>
      }
      titleAction={<EditTitleButton onClick={() => setEditOpen(true)} />}
      overflowActions={[
        {
          label: "Write off balance",
          title: "Write off part or all of the outstanding balance",
          show: (ledger?.balance_kurus ?? 0) > 0,
          onSelect: () => setWriteOffOpen(true),
        },
      ]}
      headline={
        ledger && (
          <HeadlineFigure
            label="Receivable balance"
            amountKurus={ledger.balance_kurus}
            caption={
              // The books are in lira and the figure above is the ledger's
              // truth. What the agency agreed to pay is what they will hand
              // over, though, so it is named here — the lira equivalent moves
              // with the rate until they do.
              formatForexOutstanding(ledger.outstanding_by_currency) ??
              (ledger.balance_kurus > 0
                ? "Owed by this customer"
                : "Nothing outstanding")
            }
          />
        )
      }
      activity={
        ledger && (
          <DetailSection title="Ledger">
            <LedgerTable
              columns={[
                { key: "date", label: "Date" },
                { key: "type", label: "Type" },
                { key: "description", label: "Description" },
                { key: "pax", label: "Pax / forex" },
                { key: "amount", label: "Amount", align: "right" },
              ]}
              hasActions
              isEmpty={ledger.entries.length === 0}
              isFiltered={visibleRows.length === 0}
              history={{
                hiddenCount,
                showHistory,
                onToggle: setShowHistory,
              }}
            >
                {visibleRows.map((entry) => {
                  const actions = customerLedgerRowActions({
                    movementType: entry.movement_type,
                    referenceType: entry.reference_type,
                  });
                  const isGroupSale =
                    entry.movement_type === "credit_sale" &&
                    entry.reference_type === "group_sale" &&
                    entry.reference_id;
                  return (
                  <DataTableRow
                    key={entry.id}
                    className={subledgerRowClassName(entry.display_kind)}
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
                      {actions.canEdit || actions.canVoid ? (
                        // A group sale used to be the exception here: one
                        // "Edit / Void" button that navigated to the sale's
                        // own page, where you had to find Edit or Void and
                        // press it again. It goes through the same component
                        // as every other row now, differing only in what the
                        // handlers do — and in that both act on the sale
                        // (`reference_id`) rather than the journal entry,
                        // because a group sale is its own record.
                        //
                        // Folded into this branch rather than kept beside it
                        // so `customerLedgerRowActions` stays the only place
                        // that decides whether a row may be edited. It already
                        // answers for group sales; the old branch ignored it,
                        // and drew the button on superseded rows too.
                        <SubledgerRowActions
                          row={entry}
                          showEdit={actions.canEdit}
                          onEdit={() => {
                            if (isGroupSale) {
                              setGroupSaleEditId(String(entry.reference_id));
                              return;
                            }
                            if (entry.movement_type === "discount") {
                              setCorrectWriteOff({
                                journal_entry_id: entry.journal_entry_id!,
                                amount_kurus: entry.amount_kurus,
                                description: entry.description,
                              });
                              return;
                            }
                            if (entry.movement_type === "payment_received") {
                              setCorrectPayment({
                                journal_entry_id: entry.journal_entry_id!,
                                movement_date: entry.movement_date,
                                amount_kurus: entry.amount_kurus,
                                description: entry.description,
                                payment_account_id: entry.payment_account_id,
                                payment_native_quantity: entry.payment_native_quantity,
                                forex_currency: entry.forex_currency,
                              });
                              return;
                            }
                            setCorrectCreditSale({
                              journal_entry_id: entry.journal_entry_id!,
                              movement_date: entry.movement_date,
                              amount_kurus: entry.amount_kurus,
                              description: entry.description,
                            });
                          }}
                          onVoid={() =>
                            setVoidTarget(
                              isGroupSale
                                ? {
                                    journal_entry_id: String(entry.reference_id),
                                    description: entry.description,
                                    kind: "group_sale",
                                  }
                                : {
                                    journal_entry_id: entry.journal_entry_id!,
                                    description: entry.description,
                                    kind:
                                      entry.movement_type === "payment_received"
                                        ? "payment"
                                        : entry.movement_type === "discount"
                                          ? "write_off"
                                          : "credit_sale",
                                  },
                            )
                          }
                        />
                      ) : null}
                    </DataTableCell>
                  </DataTableRow>
                  );
                })}
            </LedgerTable>
          </DetailSection>
        )
      }
    >
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
          {ledger && (
            // One dialog for both jobs: posting a write-off and amending one.
            // `correcting` decides which endpoint it calls and how it caps the
            // amount, so the two cannot drift apart in wording or validation.
            <CustomerWriteOffDialog
              open={writeOffOpen || correctWriteOff !== null}
              customerId={customerId}
              balanceKurus={ledger.balance_kurus}
              correcting={correctWriteOff}
              onClose={() => {
                setWriteOffOpen(false);
                setCorrectWriteOff(null);
              }}
              onSaved={() => void reload()}
            />
          )}
          <CustomerPaymentForm
            open={paymentOpen}
            customerId={customerId}
            balanceKurus={ledger?.balance_kurus}
            outstandingByCurrency={ledger?.outstanding_by_currency}
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
          <CorrectCreditSaleForm
            open={correctCreditSale !== null}
            customerId={customerId}
            sale={correctCreditSale}
            onClose={() => setCorrectCreditSale(null)}
            onSaved={() => void reload()}
          />
          <GroupSaleEditLoader
            open={groupSaleEditId !== null}
            groupSaleId={groupSaleEditId}
            onClose={() => setGroupSaleEditId(null)}
            onSaved={() => {
              setGroupSaleEditId(null);
              void reload();
            }}
          />
          <VoidSubledgerDialog
            open={voidTarget !== null}
            title={voidTarget ? VOIDABLE_ROWS[voidTarget.kind].title : ""}
            description={voidTarget?.description}
            voidPath={
              entityId && voidTarget
                ? `/entities/${entityId}/${VOIDABLE_ROWS[voidTarget.kind].path(
                    customerId,
                    voidTarget.journal_entry_id,
                  )}`
                : null
            }
            onClose={() => setVoidTarget(null)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </EntityDetailPage>
  );
}
