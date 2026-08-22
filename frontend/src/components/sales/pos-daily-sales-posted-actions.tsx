"use client";

import { Button } from "@/components/ui/button";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { canUseRecordAction } from "@/lib/entity-access";
import { posDailySalesVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { cn } from "@/lib/utils";

type Props = {
  row: PosDailySummary;
  grants: readonly string[];
  onCorrect: () => void;
  onVoid: () => void;
  /** Tighter buttons on mobile cards. */
  compact?: boolean;
};

/** Edit + two-step void for a posted POS daily summary — desktop table and mobile cards. */
export function PosDailySalesPostedActions({
  row,
  grants,
  onCorrect,
  onVoid,
  compact = false,
}: Props) {
  if (!canUseRecordAction(grants, "sales")) return null;

  const buttonClass = compact ? "h-8 px-2 text-xs" : "h-8 px-3 text-xs";

  return (
    <div className={cn("flex justify-end gap-1", compact && "mt-1")}>
      <Button
        type="button"
        variant="secondary"
        className={buttonClass}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCorrect();
        }}
      >
        Edit
      </Button>
      <VoidTriggerButton
        confirmDetail={posDailySalesVoidConfirmDetail(row)}
        onContinue={onVoid}
        className={cn(compact && "px-2 text-xs")}
      />
    </div>
  );
}
