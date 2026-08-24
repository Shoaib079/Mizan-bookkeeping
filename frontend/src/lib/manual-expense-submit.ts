/** POST cash or partner-paid manual expense (shared by ManualExpenseForm hook). */

import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import type { PaymentMode } from "@/lib/manual-expense-draft";

export async function submitManualExpense(args: {
  entityId: string;
  actorId: string;
  paymentMode: PaymentMode;
  partnerId: string;
  moneyAccountId: string;
  expenseAccountId: string;
  expenseDate: string;
  amountKurus: number;
  itemName: string;
  notes: string;
  confirmExpenseItemId: string | null;
  idempotencyKey: string;
  acknowledgedDuplicate: boolean;
}): Promise<void> {
  const description = args.itemName || "Manual expense";
  if (args.paymentMode === "partner") {
    await apiFetch(
      `/entities/${args.entityId}/partners/${args.partnerId}/expenses-fronted`,
      {
        method: "POST",
        idempotencyKey: args.idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withAcknowledgeDuplicate(
            {
              expense_date: args.expenseDate,
              amount_kurus: args.amountKurus,
              description,
              actor_id: args.actorId,
              expense_account_id: args.expenseAccountId,
            },
            args.acknowledgedDuplicate,
          ),
        ),
      },
    );
    return;
  }

  await apiFetch(`/entities/${args.entityId}/expenses`, {
    method: "POST",
    idempotencyKey: args.idempotencyKey,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      withAcknowledgeDuplicate(
        {
          expense_date: args.expenseDate,
          amount_kurus: args.amountKurus,
          expense_account_id: args.expenseAccountId,
          money_account_id: args.moneyAccountId,
          written_item_description: args.itemName || null,
          has_source_document: false,
          description,
          notes: args.notes.trim() || null,
          actor_id: args.actorId,
          confirm_expense_item_id: args.confirmExpenseItemId,
        },
        args.acknowledgedDuplicate,
      ),
    ),
  });
}

export function manualExpenseSuccessToast(paymentMode: PaymentMode): string {
  return paymentMode === "partner"
    ? "Partner expense recorded"
    : "Expense recorded";
}
