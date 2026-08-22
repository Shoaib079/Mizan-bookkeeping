import { formatFxNative } from "@/lib/fx-money";
import { formatTrDate, formatTry } from "@/lib/money";
import { allocationRowLabel } from "@/lib/partner-ledger-view";
import { partnerMovementLabels, staffMovementLabels } from "@/lib/subledger-labels";
import { ledgerRowSourceLabel } from "@/lib/transaction-registry";
import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

export function partnerMovementTypeLabel(
  movementType: string,
  bandTitle?: string | null,
): string {
  return (
    (bandTitle && allocationRowLabel(movementType)) ??
    partnerMovementLabels[movementType] ??
    movementType
  );
}

export function staffMovementTypeLabel(
  movementType: string,
  isAdvanceOffset: boolean,
): string {
  if (isAdvanceOffset) return "Advance applied";
  return staffMovementLabels[movementType] ?? movementType;
}

export function fxMovementTypeLabel(movementType: string): string {
  if (movementType === "purchase") return "FX purchase";
  if (movementType === "spend") return "FX spend";
  if (movementType === "conversion") return "FX conversion";
  return movementType.replace(/_/g, " ");
}

export function ledgerVoidConfirmDetail(parts: {
  date: string;
  type: string;
  amount: string;
  description: string;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(parts.date),
    type: parts.type,
    amount: parts.amount,
    description: parts.description,
  });
}

export function fxLedgerVoidConfirmDetail(parts: {
  movement_date: string;
  movement_type: string;
  native_quantity: number;
  currency: string;
  description: string;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(parts.movement_date),
    type: fxMovementTypeLabel(parts.movement_type),
    amount: formatFxNative(Math.abs(parts.native_quantity), parts.currency),
    description: parts.description,
  });
}

export function expenseVoidConfirmDetail(row: {
  expense_date: string;
  description: string;
  written_item_description?: string | null;
  amount_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(row.expense_date),
    type: "Expense",
    amount: formatTry(row.amount_kurus),
    description: row.written_item_description || row.description,
  });
}

export function manualJournalVoidConfirmDetail(row: {
  entry_date: string;
  description: string;
  total_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(row.entry_date),
    type: "Manual journal",
    amount: formatTry(row.total_kurus),
    description: row.description,
  });
}

export function glEntryVoidConfirmDetail(parts: {
  entry_date: string;
  source: string;
  reverses_entry_id?: string | null;
  amount_kurus?: number;
  description: string;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(parts.entry_date),
    type: ledgerRowSourceLabel(parts.source, parts.reverses_entry_id),
    amount:
      parts.amount_kurus != null ? formatTry(parts.amount_kurus) : undefined,
    description: parts.description,
  });
}

export function posDailySalesVoidConfirmDetail(row: {
  summary_date: string | null;
  total_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: row.summary_date ? formatTrDate(row.summary_date) : undefined,
    type: "Daily sales",
    amount: formatTry(row.total_kurus),
  });
}

export function cardSalesBatchVoidConfirmDetail(row: {
  sales_date: string;
  gross_amount_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(row.sales_date),
    type: "Card sales batch",
    amount: formatTry(row.gross_amount_kurus),
  });
}

export function posSettlementVoidConfirmDetail(row: {
  settlement_date: string;
  amount_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(row.settlement_date),
    type: "POS settlement",
    amount: formatTry(row.amount_kurus),
  });
}

export function deliveryReportVoidConfirmDetail(row: {
  period_label: string;
  platform_name: string;
  gross_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: row.period_label,
    type: `Delivery report · ${row.platform_name}`,
    amount: formatTry(row.gross_kurus),
  });
}

export function deliverySettlementVoidConfirmDetail(row: {
  settlement_date: string;
  platform_name: string;
  amount_kurus: number;
}) {
  return formatVoidConfirmDetail({
    date: formatTrDate(row.settlement_date),
    type: `Delivery settlement · ${row.platform_name}`,
    amount: formatTry(row.amount_kurus),
  });
}
