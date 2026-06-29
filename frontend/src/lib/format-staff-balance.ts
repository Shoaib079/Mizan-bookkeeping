import { formatTry } from "@/lib/money";

/** Display staff ledger balance (TRY kuruş or FX minor units). */
export function formatStaffBalanceMinor(
  balanceMinor: number,
  payCurrency: string,
): string {
  if (payCurrency === "TRY") return formatTry(balanceMinor);
  return `${(balanceMinor / 100).toFixed(2)} ${payCurrency}`;
}
