/** Balance cell for Staff / Partners / Customers / Suppliers directories.

Direction words come only from ``directoryBalanceDirection`` — pages must not
invent their own "owes you" / "you owe" copy.
*/

import { directoryBalanceDirection } from "@/lib/subledger-balance";
import { cn } from "@/lib/utils";

type Party = "employee" | "partner" | "customer" | "supplier";

export function DirectoryBalanceCell({
  balanceMinor,
  party,
  formatAbs,
  loading = false,
  className,
}: {
  balanceMinor: number | undefined;
  party: Party;
  /** Formats the absolute magnitude (currency / FX). */
  formatAbs: (absMinor: number) => string;
  loading?: boolean;
  className?: string;
}) {
  if (loading || balanceMinor === undefined) {
    return (
      <span className={cn("tabular-nums text-muted-foreground", className)}>
        {loading ? "…" : "—"}
      </span>
    );
  }

  const direction = directoryBalanceDirection(balanceMinor, party);
  const amount =
    balanceMinor === 0 ? null : formatAbs(Math.abs(balanceMinor));

  return (
    <span
      className={cn("inline-flex flex-col items-end gap-0.5 tabular-nums", className)}
      data-direction={direction}
      data-balance-sign={
        balanceMinor > 0 ? "positive" : balanceMinor < 0 ? "negative" : "zero"
      }
    >
      {amount !== null && <span>{amount}</span>}
      <span className="text-xs font-normal text-muted-foreground">{direction}</span>
    </span>
  );
}
