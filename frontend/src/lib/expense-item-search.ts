export type ExpenseItemSearchResult = {
  id: string;
  canonical_name: string;
  default_expense_account_id: string | null;
};

export const EXPENSE_ITEM_SEARCH_MIN_CHARS = 2;
export const EXPENSE_ITEM_SEARCH_DEBOUNCE_MS = 300;
export const EXPENSE_ITEM_SEARCH_LIMIT = 8;

export function expenseItemSearchUrl(entityId: string, query: string): string {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(EXPENSE_ITEM_SEARCH_LIMIT),
  });
  return `/entities/${entityId}/expense-items?${params.toString()}`;
}

/** Clear a picked item when the user edits the text after selecting from the list. */
export function clearConfirmItemOnTextEdit(
  confirmItemId: string | null,
  pickedCanonicalName: string | null,
  nextText: string,
): boolean {
  if (!confirmItemId || !pickedCanonicalName) return false;
  return nextText.trim() !== pickedCanonicalName.trim();
}

export function shouldSearchExpenseItems(text: string): boolean {
  return text.trim().length >= EXPENSE_ITEM_SEARCH_MIN_CHARS;
}
