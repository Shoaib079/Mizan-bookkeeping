/** Expense accounts from chart-of-accounts listing — filter by account_type. */

import { apiFetch } from "@/lib/api";

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
  const en = account.name_en?.trim();
  if (en) return en;
  const tr = account.name_tr?.trim();
  if (tr) return tr;
  const legacy = account.name?.trim();
  if (legacy) return legacy;
  return account.code;
}

/** Picker label for expense GL accounts — English name with code (review & posting). */
export function formatExpenseAccountLabel(
  account: Pick<ChartAccount, "code" | "name_tr" | "name_en" | "name">,
): string {
  return `${account.code} — ${expenseAccountDisplayName(account)}`;
}

export function expenseAccountComboboxOptions(
  accounts: ChartAccount[],
): { value: string; label: string }[] {
  return accounts.map((account) => ({
    value: account.id,
    label: formatExpenseAccountLabel(account),
  }));
}

/**
 * Control / special-flow expense accounts that must NOT be picked in a free-form
 * manual expense — they require a dedicated flow or are system-managed:
 *  - 5100 Salaries & Wages → use Staff → Pay salary (attributes to an employee + staff ledger)
 *  - 5400 Cash Over/Short  → set automatically by the day-close reconciliation, never manual
 *  - 5500 Delivery Commission → posted via the delivery commission flow
 *  - 5800 Sales Discounts → posted only by the group-sale discount write-off
 */
const NON_MANUAL_EXPENSE_CODES = new Set(["5100", "5400", "5500", "5800"]);

export function filterExpenseAccounts(accounts: ChartAccount[]): ChartAccount[] {
  return accounts.filter(
    (a) => a.account_type === "expense" && !NON_MANUAL_EXPENSE_CODES.has(a.code),
  );
}

/** Merge a newly created category into a picker list (no refetch). */
export function mergeExpenseAccounts(
  existing: ChartAccount[],
  ...added: ChartAccount[]
): ChartAccount[] {
  const byId = new Map<string, ChartAccount>();
  for (const account of filterExpenseAccounts([...existing, ...added])) {
    byId.set(account.id, account);
  }
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function findExpenseAccountByCode(
  accounts: ChartAccount[],
  code: string,
): ChartAccount | undefined {
  return filterExpenseAccounts(accounts).find((a) => a.code === code);
}

/** Load expense GL accounts for pickers (code + English/Turkish name). */
export async function fetchExpenseAccounts(
  entityId: string,
): Promise<ChartAccount[]> {
  const chart = await apiFetch<{ items: ChartAccount[] }>(
    `/entities/${entityId}/chart-of-accounts?limit=200`,
  );
  return filterExpenseAccounts(chart.items);
}
