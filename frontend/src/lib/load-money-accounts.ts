import { apiFetch } from "@/lib/api";

export type MoneyAccountOption = {
  id: string;
  name: string;
  account_kind: string;
};

/** Bank + cash accounts for payment pickers. */
export async function loadBankAndCashAccounts(
  entityId: string,
): Promise<MoneyAccountOption[]> {
  const [bankRes, cashRes] = await Promise.all([
    apiFetch<{ items: MoneyAccountOption[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
    ),
    apiFetch<{ items: MoneyAccountOption[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    ),
  ]);
  return [...bankRes.items, ...cashRes.items];
}
