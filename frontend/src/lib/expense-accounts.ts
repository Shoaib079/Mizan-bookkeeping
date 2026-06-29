/** Expense accounts from chart-of-accounts listing — filter by account_type. */

export type ChartAccount = {
  id: string;
  code: string;
  name_en: string;
  name_tr: string;
  account_type?: string;
  /** Legacy single-name field from older typings; prefer name_tr / name_en. */
  name?: string;
};

export function expenseAccountDisplayName(
  account: Pick<ChartAccount, "name_tr" | "name_en" | "name" | "code">,
): string {
  const tr = account.name_tr?.trim();
  if (tr) return tr;
  const en = account.name_en?.trim();
  if (en) return en;
  const legacy = account.name?.trim();
  if (legacy) return legacy;
  return account.code;
}

/** Human-readable picker label: Turkish name first, GL code in parentheses. */
export function formatExpenseAccountLabel(
  account: Pick<ChartAccount, "code" | "name_tr" | "name_en" | "name">,
): string {
  return `${expenseAccountDisplayName(account)} (${account.code})`;
}

export function filterExpenseAccounts(accounts: ChartAccount[]): ChartAccount[] {
  return accounts.filter((a) => a.account_type === "expense");
}

export function findExpenseAccountByCode(
  accounts: ChartAccount[],
  code: string,
): ChartAccount | undefined {
  return filterExpenseAccounts(accounts).find((a) => a.code === code);
}
