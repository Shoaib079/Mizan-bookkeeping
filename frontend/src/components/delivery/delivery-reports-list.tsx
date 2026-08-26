"use client";

/** Delivery reports list — desktop table / phone cards. */

import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDeliveryPeriod } from "@/lib/delivery-period";
import { deliveryReportVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTry } from "@/lib/money";
import type { DeliveryReport } from "@/lib/pos-delivery-types";
import { cn } from "@/lib/utils";

type Props = {
  items: DeliveryReport[];
  platformFilter: string | null;
  reportId: string | null;
  isMobile: boolean;
  onSelect: (id: string) => void;
  onVoid: (row: DeliveryReport) => void;
};

export function DeliveryReportsList({
  items,
  platformFilter,
  reportId,
  isMobile,
  onSelect,
  onVoid,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {items.map((row) => {
          const signed = row.gross_kurus;
          return (
            <MobileCardRow
              key={row.id}
              title={formatDeliveryPeriod(row)}
              onClick={() => onSelect(row.id)}
              meta={
                <>
                  {!platformFilter && <span>{row.platform_name}</span>}
                  {!platformFilter && <span>·</span>}
                  <StatusBadge status={row.status} />
                  {row.id === reportId && (
                    <span className="text-primary">Selected</span>
                  )}
                </>
              }
              amount={formatTry(row.gross_kurus)}
              amountClassName={moneyAmountClassName(signed)}
              leadingIcon={moneyLeadingIcon(signed)}
              trailing={
                row.status === "posted" ? (
                  <VoidTriggerButton
                    confirmDetail={deliveryReportVoidConfirmDetail({
                      period_label: formatDeliveryPeriod(row),
                      platform_name: row.platform_name,
                      gross_kurus: row.gross_kurus,
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
    <DataTable>
      <DataTableHead>
        <tr>
          {!platformFilter && (
            <DataTableHeaderCell>Platform</DataTableHeaderCell>
          )}
          <DataTableHeaderCell>Period</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {items.map((row) => {
          const selected = row.id === reportId;
          return (
            <tr
              key={row.id}
              className={cn(
                "cursor-pointer border-b border-border transition-colors hover:bg-muted/40",
                selected && "bg-primary/5",
              )}
              onClick={() => onSelect(row.id)}
            >
              {!platformFilter && (
                <DataTableCell className="py-2 text-sm">
                  {row.platform_name}
                </DataTableCell>
              )}
              <DataTableCell className="py-2 text-sm">
                {formatDeliveryPeriod(row)}
              </DataTableCell>
              <DataTableCell align="right" className="py-2 tabular-nums">
                {formatTry(row.gross_kurus)}
              </DataTableCell>
              <DataTableCell className="py-2">
                <StatusBadge status={row.status} />
              </DataTableCell>
              <DataTableCell
                align="right"
                className="py-2"
                onClick={(event) => event.stopPropagation()}
              >
                {row.status === "posted" && (
                  <VoidTriggerButton
                    confirmDetail={deliveryReportVoidConfirmDetail({
                      period_label: formatDeliveryPeriod(row),
                      platform_name: row.platform_name,
                      gross_kurus: row.gross_kurus,
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
