"use client";

/** Phone cards for the expenses review list. */

import {
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { expenseVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import { isPendingReviewStatus } from "@/lib/review-status";

type Props = {
  items: CorrectableExpenseRow[];
  onCorrect: (row: CorrectableExpenseRow) => void;
  onVoid: (target: { expense_id: string; description: string }) => void;
};

export function ExpensesReviewMobileCards({
  items,
  onCorrect,
  onVoid,
}: Props) {
  return (
    <MobileCardList>
      {items.map((row) => {
        const isVoided = row.status === "voided";
        const description =
          row.written_item_description || row.description;
        // Expenses are money out — force the out tone even when the API
        // stores a positive kuruş magnitude.
        const signed = -Math.abs(row.amount_kurus);
        return (
          <MobileCardRow
            key={row.id}
            title={description}
            meta={
              <>
                <span>Expense</span>
                <span>·</span>
                <span>{formatTrDate(row.expense_date)}</span>
                <StatusBadge status={row.status} />
                {row.notes?.trim() ? (
                  <span className="truncate">{row.notes}</span>
                ) : null}
              </>
            }
            amount={formatTry(row.amount_kurus)}
            amountClassName={
              isVoided
                ? "text-muted-foreground line-through"
                : moneyAmountClassName(signed)
            }
            leadingIcon={isVoided ? undefined : moneyLeadingIcon(signed)}
            trailing={
              row.status === "posted" ? (
                <SubledgerRowActions
                  row={{
                    display_kind: "effective",
                    journal_entry_id: row.journal_entry_id,
                  }}
                  voidConfirmDetail={expenseVoidConfirmDetail(row)}
                  onEdit={() => onCorrect(row)}
                  onVoid={() =>
                    onVoid({
                      expense_id: row.id,
                      description,
                    })
                  }
                />
              ) : isPendingReviewStatus(row.status) ? (
                <span className="text-xs text-muted-foreground">
                  Confirm via Record
                </span>
              ) : undefined
            }
          />
        );
      })}
    </MobileCardList>
  );
}
