/** Pure helpers for the Staff card on the Balances hub.
 *
 * Staff `balance_minor` is in the employee's pay currency (TRY kuruş or FX
 * cents). Mixing those into one TRY total is wrong — sum TRY only and surface
 * FX headcount separately so the directory remains the place for FX detail.
 */

export type StaffPayCurrencyRow = {
  id: string;
  pay_currency: string;
};

export function tryStaffIds(employees: StaffPayCurrencyRow[]): string[] {
  return employees
    .filter((row) => row.pay_currency === "TRY")
    .map((row) => row.id);
}

export function fxStaffCount(employees: StaffPayCurrencyRow[]): number {
  return employees.filter((row) => row.pay_currency !== "TRY").length;
}

export function sumTryStaffBalances(
  employees: StaffPayCurrencyRow[],
  balances: Map<string, number>,
): number {
  let total = 0;
  for (const row of employees) {
    if (row.pay_currency !== "TRY") continue;
    const balance = balances.get(row.id);
    if (balance !== undefined) total += balance;
  }
  return total;
}
