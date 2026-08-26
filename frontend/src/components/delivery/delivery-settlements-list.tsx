"use client";

/** Delivery settlements list — desktop table / phone cards. */

import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { deliverySettlementVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import type { DeliverySettlement } from "@/lib/pos-delivery-types";
import { cn } from "@/lib/utils";

type Props = {
  items: DeliverySettlement[];
  platformFilter: string | null;
  settlementId: string | null;
  isMobile: boolean;
  onSelect: (id: string) => void;
  onVoid: (row: DeliverySettlement) => void;
};

export function DeliverySettlementsList({
  items,
  platformFilter,
  settlementId,
  isMobile,
  onSelect,
  onVoid,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {items.map((row) => {
          const voided = row.status === "voided";
          const signed = row.amount_kurus;
          return (
            <MobileCardRow
              key={row.id}
              title={row.description}
              onClick={() => onSelect(row.id)}
              meta={
                <>
                  <span>{formatTrDate(row.settlement_date)}</span>
                  {!platformFilter && (
                    <>
                      <span>·</span>
                      <span>{row.platform_name}</span>
                    </>
                  )}
                  {row.id === settlementId && (
                    <span className="text-primary">Selected</span>
                  )}
                  {voided && <span>Voided</span>}
                </>
              }
              amount={formatTry(row.amount_kurus)}
              amountClassName={cn(
                moneyAmountClassName(signed),
                voided && "line-through opacity-70",
              )}
              leadingIcon={
                voided
                  ? undefined
                  : moneyLeadingIcon(signed)
              }
              trailing={
                !voided ? (
                  <VoidTriggerButton
                    confirmDetail={deliverySettlementVoidConfirmDetail({
                      settlement_date: row.settlement_date,
                      platform_name: row.platform_name,
                      amount_kurus: row.amount_kurus,
                    })}
                    onContinue={() => onVoid(row)}
                  />
                ) : undefined
              }
            />
          );
        })}
      </MobileCardList>
    );
  }

  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          {!platformFilter && (
            <DataTableHeaderCell>Platform</DataTableHeaderCell>
          )}
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {items.map((row) => {
          const selected = row.id === settlementId;
          return (
            <tr
              key={row.id}
              className={cn(
                "cursor-pointer border-b border-border transition-colors hover:bg-muted/40",
                selected && "bg-primary/5",
                row.status === "voided" &&
                  "text-muted-foreground line-through opacity-70",
              )}
              onClick={() => onSelect(row.id)}
            >
              <DataTableCell className="py-2 text-sm">
                {formatTrDate(row.settlement_date)}
              </DataTableCell>
              {!platformFilter && (
                <DataTableCell className="py-2 text-sm">
                  {row.platform_name}
                </DataTableCell>
              )}
              <DataTableCell align="right" className="py-2 tabular-nums">
                {formatTry(row.amount_kurus)}
              </DataTableCell>
              <DataTableCell className="py-2 text-sm">
                {row.description}
              </DataTableCell>
              <DataTableCell
                align="right"
                className="py-2"
                onClick={(event) => event.stopPropagation()}
              >
                {row.status !== "voided" && (
                  <VoidTriggerButton
                    confirmDetail={deliverySettlementVoidConfirmDetail({
                      settlement_date: row.settlement_date,
                      platform_name: row.platform_name,
                      amount_kurus: row.amount_kurus,
                    })}
                    onContinue={() => onVoid(row)}
                  />
                )}
              </DataTableCell>
            </tr>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
