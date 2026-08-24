/** Draft shape + emptiness for ManualExpenseForm autosave. */

export type MoneyAccount = { id: string; name: string };

export type PaymentMode = "cash" | "partner";

export type ExpenseFormDraft = {
  expenseAccountId: string;
  moneyAccountId: string;
  partnerId: string;
  paymentMode: PaymentMode;
  itemName: string;
  amountText: string;
  dateText: string;
  notes: string;
};

export function isExpenseDraftEmpty(draft: ExpenseFormDraft): boolean {
  return (
    !draft.itemName.trim() &&
    !draft.amountText.trim() &&
    !draft.dateText.trim()
  );
}
