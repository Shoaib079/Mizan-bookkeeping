/** Expense accounts from chart-of-accounts listing — filter by account_type. */

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  account_type?: string;
};

export function filterExpenseAccounts(accounts: ChartAccount[]): ChartAccount[] {
  return accounts.filter((a) => a.account_type === "expense");
}

export function findExpenseAccountByCode(
  accounts: ChartAccount[],
  code: string,
): ChartAccount | undefined {
  return filterExpenseAccounts(accounts).find((a) => a.code === code);
}
