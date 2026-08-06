"use client";

/** Group sale detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure } from "@/components/page/summary-panel";
import type { CustomerRow } from "@/components/forms/customer-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { GroupSaleForm } from "@/components/forms/group-sale-form";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
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
import { newIdempotencyKey } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatFxNative } from "@/lib/fx-money";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { useToast } from "@/lib/toast";

function hasLinkedPayment(sale: GroupSaleRead): boolean {
  if (sale.remaining_kurus == null) return false;
  return sale.remaining_kurus < sale.total_kurus;
}

export default function GroupSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const saleId = params.id;
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [sale, setSale] = useState<GroupSaleRead | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const resetState = useCallback(() => {
    setSale(null);
    setCustomer(null);
    setLoading(true);
    setError(null);
    setEditOpen(false);
    setPaymentOpen(false);
  }, []);

  useEntitySwitchReset(entityId, resetState);

  const reload = useCallback(async () => {
    if (!entityId || !saleId) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiFetch<GroupSaleRead>(
        `/entities/${entityId}/group-sales/${saleId}`,
      );
      setSale(loaded);
      const cust = await apiFetch<CustomerRow>(
        `/entities/${entityId}/customers/${loaded.customer_id}`,
      );
      setCustomer(cust);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, saleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const paymentBlocked = useMemo(
    () => (sale ? hasLinkedPayment(sale) : false),
    [sale],
  );

  const canMutate = sale?.status === "posted" && !paymentBlocked;

  async function onVoid() {
    if (!entityId || !sale) return;
    setVoiding(true);
    try {
      await apiFetch(`/entities/${entityId}/group-sales/${sale.id}/void`, {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast("Group sale voided");
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Void failed", "error");
    } finally {
      setVoiding(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (error || !sale) {
    return <p className="text-sm text-destructive">{error ?? "Not found"}</p>;
  }

  const isForex = Boolean(sale.forex_currency && sale.total_forex_minor != null);

  return (
    <EntityDetailPage
      title={sale.description}
      meta={
        <MetaFacts
          items={[
            <StatusBadge
              key="status"
              status={
                sale.status === "posted"
                  ? "active"
                  : sale.status === "voided"
                    ? "inactive"
                    : "pending"
              }
            />,
            formatTrDate(sale.sale_date),
            customer && (
              <Link
                key="customer"
                href={`/customers/${customer.id}`}
                className="text-primary hover:underline"
              >
                {customer.name}
              </Link>
            ),
            sale.fx_rate_used != null &&
              sale.forex_currency &&
              `Sale-date rate ${formatTry(sale.fx_rate_used)} per 1 ${sale.forex_currency}`,
          ].filter(Boolean)}
        />
      }
      primaryAction={
        sale.status === "posted" && (
          <Button type="button" onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
        )
      }
      actions={
        sale.status === "posted" &&
        canMutate && (
          <VoidTriggerButton
            className="h-9 border border-destructive/40 px-4 hover:bg-destructive/10"
            confirmTitle="Void this group sale?"
            confirmDetail={
              customer
                ? `${customer.name} · ${formatTry(sale.total_kurus)}`
                : formatTry(sale.total_kurus)
            }
            confirmLabel="Void group sale"
            confirming={voiding}
            onContinue={() => void onVoid()}
          />
        )
      }
      overflowActions={[
        {
          label: "Edit group sale",
          show: sale.status === "posted",
          title: canMutate
            ? undefined
            : "Void or settle the linked payment first",
          onSelect: () => {
            if (canMutate) setEditOpen(true);
          },
        },
        {
          label: "View original",
          show: Boolean(sale.amends_group_sale_id),
          onSelect: () =>
            router.push(`/customers/group-sales/${sale.amends_group_sale_id}`),
        },
        {
          label: "View correction",
          show: Boolean(sale.amended_by_group_sale_id),
          onSelect: () =>
            router.push(
              `/customers/group-sales/${sale.amended_by_group_sale_id}`,
            ),
        },
      ]}
      headline={
        <HeadlineFigure
          label="Booked (TRY)"
          amountKurus={sale.total_kurus}
          caption={
            isForex && sale.total_forex_minor != null
              ? `${formatFxNative(sale.total_forex_minor, sale.forex_currency!)} in ${sale.forex_currency}`
              : undefined
          }
        />
      }
      activity={
        <DetailSection title="Menu lines">
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Menu</DataTableHeaderCell>
            <DataTableHeaderCell>Pax</DataTableHeaderCell>
            <DataTableHeaderCell>Rate / person</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Line total</DataTableHeaderCell>
            <DataTableHeaderCell align="right">TRY</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sale.lines.map((line) => (
            <DataTableRow key={line.id}>
              <DataTableCell>{line.menu_name_snapshot}</DataTableCell>
              <DataTableCell>{line.pax}</DataTableCell>
              <DataTableCell className="tabular-nums">
                {isForex
                  ? formatFxNative(
                      line.rate_per_person_minor,
                      sale.forex_currency!,
                    )
                  : formatTry(line.rate_per_person_minor)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {isForex
                  ? formatFxNative(line.line_total_minor, sale.forex_currency!)
                  : formatTry(line.line_total_minor)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(line.line_total_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
        </DetailSection>
      }
    >
      <GroupSaleForm
        open={editOpen}
        customerId={sale.customer_id}
        correcting={sale}
        onClose={() => setEditOpen(false)}
        onSaved={() => void reload()}
      />
      <CustomerPaymentForm
        open={paymentOpen}
        customerId={sale.customer_id}
        groupSaleId={sale.id}
        forexReceivableCurrency={sale.forex_currency}
        remainingForexMinor={sale.remaining_forex_minor}
        balanceKurus={sale.remaining_kurus ?? undefined}
        onClose={() => setPaymentOpen(false)}
        onSaved={() => void reload()}
      />
    </EntityDetailPage>
  );
}
