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
    .map(toOption);
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
