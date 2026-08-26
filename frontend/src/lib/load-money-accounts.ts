import { apiFetch } from "@/lib/api";

export type MoneyAccountOption = {
  id: string;
  gl_account_id: string;
  name: string;
  account_kind: string;
  currency?: string | null;
};

type MoneyAccountApiRow = {
  id: string;
  gl_account_id: string;
  name: string;
  account_kind: string;
  currency?: string | null;
  is_active?: boolean;
};

function toOption(row: MoneyAccountApiRow): MoneyAccountOption {
  return {
    id: row.id,
    gl_account_id: row.gl_account_id,
    name: row.name,
    account_kind: row.account_kind,
    currency: row.currency ?? null,
  };
}

export const DEFAULT_CASH_DRAWER_NAME = "Main Drawer";

/** Prefer seeded main drawer; else first cash account. */
export function defaultMainDrawerId(
  accounts: MoneyAccountOption[],
): string | null {
  const cash = accounts.filter((a) => a.account_kind === "cash");
  const named = cash.find((a) => a.name === DEFAULT_CASH_DRAWER_NAME);
  return (named ?? cash[0])?.id ?? null;
}

function cashHomeNameScore(name: string): number {
  const n = name.trim().toLowerCase();
  if (n.includes("home") || n.includes("ev")) return 0;
  if (n.includes("safe") || n.includes("kasa")) return 1;
  return 2;
}

/** True when the drawer is a home/safe holding place (not the counter till). */
export function isCashHomeDrawerName(name: string): boolean {
  return cashHomeNameScore(name) < 2;
}

/** Prefer “Cash at home” / Safe-style drawer for post-close send (not the till). */
export function preferCashHomeDrawerId(
  accounts: { id: string; name: string }[],
  excludeId?: string,
): string | null {
  const others = accounts.filter((a) => a.id !== excludeId);
  if (others.length === 0) return null;
  return (
    [...others].sort(
      (a, b) => cashHomeNameScore(a.name) - cashHomeNameScore(b.name),
    )[0]?.id ?? null
  );
}

/** Counter till for Count cash / Close day — Main Drawer only (never home/safe). */
export function mainTillAccount<T extends { id: string; name: string; account_kind?: string }>(
  accounts: T[],
): T | null {
  const cash = accounts.filter(
    (a) => !a.account_kind || a.account_kind === "cash",
  );
  const main =
    cash.find((a) => a.name === DEFAULT_CASH_DRAWER_NAME) ??
    cash.find((a) => !isCashHomeDrawerName(a.name)) ??
    null;
  return main;
}

/** Cash-at-home style account for read-only reference on Count/Close. */
export function cashHomeReferenceAccount<
  T extends { id: string; name: string; account_kind?: string },
>(accounts: T[]): T | null {
  const cash = accounts.filter(
    (a) => !a.account_kind || a.account_kind === "cash",
  );
  const homeId = preferCashHomeDrawerId(cash);
  if (!homeId) return null;
  const home = cash.find((a) => a.id === homeId) ?? null;
  if (home && isCashHomeDrawerName(home.name)) return home;
  return null;
}

/** Show a drawer picker only when the owner must choose between multiple drawers. */
export function shouldShowCashDrawerPicker(
  cashAccounts: readonly unknown[],
): boolean {
  return cashAccounts.length > 1;
}

/** Option label for drawer pickers — generic when there is only one drawer. */
export function formatCashDrawerOptionLabel(
  accountName: string,
  cashAccounts: readonly unknown[],
): string {
  return shouldShowCashDrawerPicker(cashAccounts) ? accountName : "Cash drawer";
}

export function formatMoneyAccountKindLabel(kind: string): string {
  switch (kind) {
    case "bank":
      return "Bank";
    case "cash":
      return "Cash drawer";
    case "credit_card":
      return "Credit card";
    default:
      return kind;
  }
}

export function formatMoneyAccountOptionLabel(
  account: MoneyAccountOption,
  opts?: { cashAccountCount?: number },
): string {
  if (
    account.account_kind === "cash" &&
    (opts?.cashAccountCount ?? 1) <= 1
  ) {
    return formatMoneyAccountKindLabel(account.account_kind);
  }
  return `${account.name} (${formatMoneyAccountKindLabel(account.account_kind)})`;
}

/** First bank account, if any. */
export function defaultBankAccountId(
  accounts: MoneyAccountOption[],
): string | null {
  return accounts.find((a) => a.account_kind === "bank")?.id ?? null;
}

/** Cash drawer accounts only — manual partner/staff bank moves use statement classify. */
export async function loadCashAccounts(
  entityId: string,
): Promise<MoneyAccountOption[]> {
  const cashRes = await apiFetch<{ items: MoneyAccountApiRow[] }>(
    `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
  );
  return cashRes.items.filter((row) => row.is_active !== false).map(toOption);
}

/** Bank + cash accounts for payment pickers. */
export async function loadBankAndCashAccounts(
  entityId: string,
): Promise<MoneyAccountOption[]> {
  const [bankRes, cashRes] = await Promise.all([
    apiFetch<{ items: MoneyAccountApiRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
    ),
    apiFetch<{ items: MoneyAccountApiRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    ),
  ]);
  return [...bankRes.items, ...cashRes.items]
    .filter((row) => row.is_active !== false)
    .map(toOption)
    .filter((row) => isTransferMoneyAccountKind(row.account_kind));
}

/** Transfer From/To — cash drawers and bank accounts only (no FX / cards). */
export function isTransferMoneyAccountKind(kind: string): boolean {
  return kind === "cash" || kind === "bank";
}

export function filterTransferMoneyAccounts<
  T extends { account_kind: string },
>(accounts: T[]): T[] {
  return accounts.filter((a) => isTransferMoneyAccountKind(a.account_kind));
}

/** Bank, cash, and FX wallets for customer payment receipts. */
export async function loadPaymentReceiveAccounts(
  entityId: string,
): Promise<MoneyAccountOption[]> {
  const [bankRes, cashRes, fxRes] = await Promise.all([
    apiFetch<{ items: MoneyAccountApiRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
    ),
    apiFetch<{ items: MoneyAccountApiRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    ),
    apiFetch<{ items: MoneyAccountApiRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=foreign_currency&limit=50`,
    ),
  ]);
  return [...bankRes.items, ...cashRes.items, ...fxRes.items]
    .filter((row) => row.is_active !== false)
    .map(toOption);
}

/** Combobox label for a payment-receive money account. */
export function paymentReceiveAccountLabel(account: MoneyAccountOption): string {
  if (account.account_kind === "foreign_currency" && account.currency) {
    return `${account.name} (${account.currency} wallet)`;
  }
  return `${account.name} (${account.account_kind})`;
}

/** FX wallet accounts for a given pay currency (USD, EUR, GBP). */
export async function loadForeignCurrencyAccounts(
  entityId: string,
  currency: string,
): Promise<MoneyAccountOption[]> {
  const all = await loadAllForeignCurrencyAccounts(entityId);
  const code = currency.toUpperCase();
  return all.filter((row) => row.currency?.toUpperCase() === code);
}

/** All active FX wallet accounts for the entity. */
export async function loadAllForeignCurrencyAccounts(
  entityId: string,
): Promise<MoneyAccountOption[]> {
  const res = await apiFetch<{ items: MoneyAccountApiRow[] }>(
    `/entities/${entityId}/banking/accounts?account_kind=foreign_currency&limit=50`,
  );
  return res.items
    .filter((row) => row.is_active !== false)
    .map(toOption);
}
