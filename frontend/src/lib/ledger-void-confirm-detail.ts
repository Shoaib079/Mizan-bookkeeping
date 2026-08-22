import { formatTrDate } from "@/lib/money";
import { allocationRowLabel } from "@/lib/partner-ledger-view";
import { partnerMovementLabels, staffMovementLabels } from "@/lib/subledger-labels";
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
