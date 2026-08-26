"use client";

import Link from "next/link";

import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

type RowProps = {
  account: MoneyAccountLeaf;
  variant?: "compact" | "default";
  /** When false, account name is plain text (dashboard static snapshot). */
  interactive?: boolean;
  className?: string;
};

export function BankAccountBalanceRow({
  account,
  variant = "default",
  interactive = true,
  className,
}: RowProps) {
  const name = (
    <>
      {account.name}
      {account.last_four && (
        <span className="font-normal text-muted-foreground">
          {" "}
          ···{account.last_four}
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        variant === "compact" ? "py-1.5" : "py-3",
        className,
      )}
    >
      <div className="min-w-0">
        {interactive ? (
          <Link
            href={`/banking/accounts/${account.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="text-sm font-medium text-foreground">{name}</span>
        )}
        {account.bank_name && account.bank_name !== account.name && (
          <p className="truncate text-xs text-muted-foreground">
            {account.bank_name}
          </p>
        )}
      </div>
      <span className="shrink-0 tabular-nums text-sm font-semibold">
        {formatTry(account.balance_kurus)}
      </span>
    </div>
  );
}

type ListProps = {
  accounts: MoneyAccountLeaf[];
  variant?: "compact" | "default";
  interactive?: boolean;
  className?: string;
};

export function BankAccountBalanceRows({
  accounts,
  variant = "default",
  interactive = true,
  className,
}: ListProps) {
  const active = accounts.filter((account) => account.is_active);

  if (active.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No bank accounts yet — add one under Banking → Banks.
      </p>
    );
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {active.map((account) => (
        <BankAccountBalanceRow
          key={account.id}
          account={account}
          variant={variant}
          interactive={interactive}
        />
      ))}
    </div>
  );
}
