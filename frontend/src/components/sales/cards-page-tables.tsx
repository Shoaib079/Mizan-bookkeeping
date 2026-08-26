"use client";

/** Card sales batches + POS settlements — desktop table / phone cards. */

import { CreditCard, Landmark } from "lucide-react";

import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cardSalesBatchVoidConfirmDetail,
  posSettlementVoidConfirmDetail,
} from "@/lib/ledger-void-confirm-detail";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import type { CardSalesBatch, PosSettlement } from "@/lib/pos-delivery-types";
import { cn } from "@/lib/utils";

function rowStatusLabel(status: string | undefined): string {
  if (status === "voided") return "voided";
  return status === "posted" || !status ? "posted" : status;
}

type BatchesProps = {
  batches: CardSalesBatch[];
  isMobile: boolean;
  onVoid: (row: CardSalesBatch) => void;
};

export function CardSalesBatchesTable({
  batches,
  isMobile,
  onVoid,
}: BatchesProps) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No card batches in this period.
      </p>
    );
  }

  if (isMobile) {
    return (
      <MobileCardList>
        {batches.map((row) => {
          const status = rowStatusLabel(row.status);
          const signed = row.gross_amount_kurus;
          return (
            <MobileCardRow
              key={row.id}
              title={row.description}
              meta={
                <>
                  <span>Card batch</span>
                  <span>·</span>
                  <span>{formatTrDate(row.sales_date)}</span>
                  <StatusBadge status={status} />
                </>
              }
              amount={formatTry(row.gross_amount_kurus)}
              amountClassName={cn(
                moneyAmountClassName(signed),
                status === "voided" && "line-through opacity-70",
              )}
              leadingIcon={{
                icon: CreditCard,
                tone: status === "voided" ? "neutral" : moneyLeadingIcon(signed).tone,
              }}
              trailing={
                status !== "voided" ? (
                  <VoidTriggerButton
                    confirmDetail={cardSalesBatchVoidConfirmDetail(row)}
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
          <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {batches.map((row) => (
          <DataTableRow
            key={row.id}
            className={
              row.status === "voided"
                ? "text-muted-foreground line-through opacity-70"
                : undefined
            }
          >
            <DataTableCell>{formatTrDate(row.sales_date)}</DataTableCell>
            <DataTableCell align="right">
              {formatTry(row.gross_amount_kurus)}
            </DataTableCell>
            <DataTableCell>{row.description}</DataTableCell>
            <DataTableCell align="right">
              {row.status !== "voided" && (
                <VoidTriggerButton
                  confirmDetail={cardSalesBatchVoidConfirmDetail(row)}
                  onContinue={() => onVoid(row)}
                />
              )}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

type SettlementsProps = {
  settlements: PosSettlement[];
  isMobile: boolean;
  onVoid: (row: PosSettlement) => void;
};

export function PosSettlementsTable({
  settlements,
  isMobile,
  onVoid,
}: SettlementsProps) {
  if (settlements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No settlements in this period.
      </p>
    );
  }

  if (isMobile) {
    return (
      <MobileCardList>
        {settlements.map((row) => {
          const status = rowStatusLabel(row.status);
          const signed = row.amount_kurus;
          return (
            <MobileCardRow
              key={row.id}
              title={row.description}
              meta={
                <>
                  <span>Settlement</span>
                  <span>·</span>
                  <span>{formatTrDate(row.settlement_date)}</span>
                  <StatusBadge status={status} />
                  {row.commission_kurus !== null && (
                    <span>Comm. {formatTry(row.commission_kurus)}</span>
                  )}
                </>
              }
              amount={formatTry(row.amount_kurus)}
              amountClassName={cn(
                moneyAmountClassName(signed),
                status === "voided" && "line-through opacity-70",
              )}
              leadingIcon={{
                icon: Landmark,
                tone: status === "voided" ? "neutral" : moneyLeadingIcon(signed).tone,
              }}
              trailing={
                status !== "voided" ? (
                  <VoidTriggerButton
                    confirmDetail={posSettlementVoidConfirmDetail(row)}
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
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Bank commission</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {settlements.map((row) => (
          <DataTableRow
            key={row.id}
            className={
              row.status === "voided"
                ? "text-muted-foreground line-through opacity-70"
                : undefined
            }
          >
            <DataTableCell>
              {formatTrDate(row.settlement_date)}
            </DataTableCell>
            <DataTableCell align="right">
              {formatTry(row.amount_kurus)}
            </DataTableCell>
            <DataTableCell align="right">
              {row.commission_kurus !== null
                ? formatTry(row.commission_kurus)
                : "—"}
            </DataTableCell>
            <DataTableCell>{row.description}</DataTableCell>
            <DataTableCell align="right">
              {row.status !== "voided" && (
                <VoidTriggerButton
                  confirmDetail={posSettlementVoidConfirmDetail(row)}
                  onContinue={() => onVoid(row)}
                />
              )}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
