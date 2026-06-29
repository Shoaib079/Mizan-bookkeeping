export type ExpenseAccountSuggestion = {
  account_id: string | null;
  source?: string | null;
  confidence?: string | null;
};

/** Apply suggestion only when the user has not manually picked a different account. */
export function shouldApplyExpenseAccountSuggestion(
  suggestion: ExpenseAccountSuggestion | null,
  currentAccountId: string,
  userPickedAccount: boolean,
): string | null {
  if (!suggestion?.account_id) return null;
  if (userPickedAccount) return null;
  if (currentAccountId && currentAccountId !== suggestion.account_id) return null;
  return suggestion.account_id;
}

export function isSuggestedAccountActive(
  accountId: string,
  suggestedAccountId: string | null,
): boolean {
  return Boolean(suggestedAccountId && accountId === suggestedAccountId);
}
