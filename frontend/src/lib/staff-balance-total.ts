/** Pure helpers for the Staff card on the Balances hub.
 *
 * Staff `balance_minor` is in the employee's pay currency (TRY kuruş or FX
 * cents). Never mix FX cents into a single ₺ total — show TRY and each FX
 * currency as separate figures on the card.
 */

export type StaffPayCurrencyRow = {
  id: string;
  pay_currency: string;
};

export function isTryPayCurrency(payCurrency: string): boolean {
  return String(payCurrency ?? "")
    .trim()
    .toUpperCase() === "TRY";
}

export function tryStaffIds(employees: StaffPayCurrencyRow[]): string[] {
  return employees.filter((row) => isTryPayCurrency(row.pay_currency)).map((row) => row.id);
}

export function fxStaffCount(employees: StaffPayCurrencyRow[]): number {
  return employees.filter((row) => !isTryPayCurrency(row.pay_currency)).length;
}

export function sumTryStaffBalances(
  employees: StaffPayCurrencyRow[],
  balances: Map<string, number>,
): number {
  let total = 0;
  for (const row of employees) {
    if (!isTryPayCurrency(row.pay_currency)) continue;
    const balance = balances.get(row.id);
    if (balance !== undefined) total += balance;
  }
  return total;
}

/** Net FX balance per currency (minor units) — not converted to TRY. */
export function sumFxStaffBalancesByCurrency(
  employees: StaffPayCurrencyRow[],
  balances: Map<string, number>,
): Map<string, number> {
  const byCurrency = new Map<string, number>();
  for (const row of employees) {
    if (isTryPayCurrency(row.pay_currency)) continue;
    const balance = balances.get(row.id);
    if (balance === undefined) continue;
    const currency = String(row.pay_currency).trim().toUpperCase();
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + balance);
  }
  return byCurrency;
}

export function formatStaffHubAmount(
  tryTotalKurus: number,
  fxByCurrency: Map<string, number>,
  formatTryFn: (kurus: number) => string,
  formatFxFn: (minor: number, currency: string) => string,
): string {
  const parts: string[] = [];
  if (tryTotalKurus !== 0) parts.push(formatTryFn(tryTotalKurus));
  for (const currency of [...fxByCurrency.keys()].sort()) {
    const minor = fxByCurrency.get(currency) ?? 0;
    if (minor !== 0) parts.push(formatFxFn(minor, currency));
  }
  if (parts.length === 0) return formatTryFn(0);
  return parts.join(" · ");
}

/** Direction for colouring — positive means money owed to staff overall. */
export function staffHubNetSign(
  tryTotalKurus: number,
  fxByCurrency: Map<string, number>,
): number {
  let sign = tryTotalKurus;
  for (const minor of fxByCurrency.values()) sign += minor;
  return sign;
}
