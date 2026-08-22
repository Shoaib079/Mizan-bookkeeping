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
import { GroupSaleDiscountDialog } from "@/components/forms/group-sale-discount-dialog";
import { GroupSaleForm } from "@/components/forms/group-sale-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
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
import { apiFetch, entityPath } from "@/lib/api";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import { canApplyGroupSaleDiscount } from "@/lib/group-sale-discount";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

function discountAmountLabel(sale: GroupSaleRead, minor: number): string {
  if (sale.forex_currency) {
    return formatFxNative(minor, sale.forex_currency);
  }
  return formatTry(minor);
}

function hasLinkedPayment(sale: GroupSaleRead): boolean {
  if (
    sale.total_kurus === 0 &&
    sale.forex_currency &&
    sale.total_forex_minor != null &&
    sale.remaining_forex_minor != null
  ) {
    return sale.remaining_forex_minor < sale.total_forex_minor;
  }
  if (sale.remaining_kurus == null) return false;
  return sale.remaining_kurus < sale.total_kurus;
}

export default function GroupSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const saleId = params.id;
  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();

  const [sale, setSale] = useState<GroupSaleRead | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

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

  const voidConfirmDetail = sale
    ? formatVoidConfirmDetail({
        date: formatTrDate(sale.sale_date),
        type: "Group sale",
        amount:
          sale.forex_currency && sale.total_forex_minor != null
            ? formatFxNative(sale.total_forex_minor, sale.forex_currency)
            : formatTry(sale.total_kurus),
        description: sale.description,
      })
    : "";

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
  const canDiscount = canApplyGroupSaleDiscount(sale, showWrite);

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
        showWrite && sale.status === "posted" ? (
          <Button type="button" onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
        ) : undefined
      }
      actions={
        sale.status === "posted" &&
        canMutate && (
          <VoidTriggerButton
            className="h-9 border border-destructive/40 px-4 hover:bg-destructive/10"
            confirmDetail={voidConfirmDetail}
            onContinue={() => setVoidOpen(true)}
          />
        )
      }
      overflowActions={[
        {
          label: "Apply discount",
          show: canDiscount,
          onSelect: () => setDiscountOpen(true),
        },
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
        <>
          {(sale.discounts?.length ?? 0) > 0 && (
            <DetailSection title="Discounts">
              <ul className="divide-y divide-border rounded-md border">
                {sale.discounts!.map((d) => (
                  <li
                    key={d.customer_ledger_entry_id}
                    className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{d.description}</p>
                      <p className="text-muted-foreground">
                        {formatTrDate(d.movement_date)}
                      </p>
                    </div>
                    <p className="tabular-nums sm:text-right">
                      {discountAmountLabel(sale, d.discount_amount_minor)}
                    </p>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
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
        </>
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
      <GroupSaleDiscountDialog
        open={discountOpen}
        sale={sale}
        onClose={() => setDiscountOpen(false)}
        onSaved={() => void reload()}
      />
      <VoidSubledgerDialog
        open={voidOpen}
        title="Void group sale"
        description={voidConfirmDetail}
        voidPath={
          entityId ? entityPath(entityId, `group-sales/${sale.id}/void`) : null
        }
        onClose={() => setVoidOpen(false)}
        onSaved={() => void reload()}
      />
    </EntityDetailPage>
  );
}
