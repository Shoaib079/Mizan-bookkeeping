/** Chart account display labels (revenue + expense pickers). */

export type ChartAccountLike = {
  id?: string;
  code: string;
  name_en?: string;
  name_tr?: string;
  name?: string;
};

export function chartAccountDisplayName(
  account: ChartAccountLike,
): string {
  const en = account.name_en?.trim();
  const tr = account.name_tr?.trim();
  const legacy = account.name?.trim();
  return en || tr || legacy || account.code;
}

export function formatChartAccountLabel(account: ChartAccountLike): string {
  return `${account.code} — ${chartAccountDisplayName(account)}`;
}

export function filterRevenueAccounts<T extends ChartAccountLike>(
  accounts: T[],
): T[] {
  return accounts.filter((a) => a.code.startsWith("4"));
}
