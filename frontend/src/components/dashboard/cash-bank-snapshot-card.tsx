"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { BankAccountBalanceRows } from "@/components/banking/bank-account-balance-rows";
import { IconSquare } from "@/components/ui/icon-square";
import {
  ACCENT_BAR,
  MeaningCardAccentBar,
} from "@/components/ui/meaning-card";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountTree } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CashAccountBalance = {
  id: string;
  name: string;
  balance_kurus: number;
};

type Props = {
  cashKurus: number;
  bankKurus: number;
  cashAccounts?: CashAccountBalance[];
};

function MoneyRow({
  label,
  amountKurus,
  href,
  emphasis,
}: {
  label: string;
  amountKurus: number;
  href?: string;
  emphasis?: "headline" | "subtotal" | "default";
}) {
  const amountClass =
    emphasis === "headline"
      ? "text-lg font-bold tabular-nums"
      : emphasis === "subtotal"
        ? "text-sm font-semibold tabular-nums"
        : "text-sm font-semibold tabular-nums";
  const labelClass =
    emphasis === "headline"
      ? "font-semibold text-foreground"
      : emphasis === "subtotal"
        ? "text-muted-foreground"
        : "text-sm font-medium text-primary";

  const amount = (
    <span className={amountClass}>{formatTry(amountKurus)}</span>
  );
  const name = href ? (
    <Link href={href} className={cn(labelClass, "hover:underline")}>
      {label}
    </Link>
  ) : (
    <span className={labelClass}>{label}</span>
  );

  return (
    <div className="flex items-baseline justify-between gap-4">
      {name}
      {href ? (
        <Link href={href} className="hover:underline">
          {amount}
        </Link>
      ) : (
        amount
      )}
    </div>
  );
}

export function CashBankSnapshotCard({
  cashKurus,
  bankKurus,
  cashAccounts = [],
}: Props) {
  const { entityId } = useEntity();
  const [bankAccounts, setBankAccounts] = useState<
    MoneyAccountTree["banks"]["accounts"]
  >([]);

  useEffect(() => {
    if (!entityId) {
      setBankAccounts([]);
      return;
    }
    let cancelled = false;
    void apiFetch<MoneyAccountTree>(
      `/entities/${entityId}/banking/accounts/tree`,
    )
      .then((tree) => {
        if (!cancelled) setBankAccounts(tree.banks.accounts);
      })
      .catch(() => {
        if (!cancelled) setBankAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const combined = cashKurus + bankKurus;

  return (
    // Same shell as StatCard — meaning card + blue bar + sky icon under v2.
    <div
      data-meaning-card
      data-testid="cash-bank-snapshot-card"
      className="relative rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]"
      style={{ ["--accent-bar" as string]: ACCENT_BAR.blue }}
    >
      <MeaningCardAccentBar />
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <IconSquare icon={Wallet} tint="sky" stroke="blue" size="lg" />
        Cash & bank
      </div>
      <div className="mt-3 space-y-3 text-sm">
        <MoneyRow
          label="Total cash & bank"
          amountKurus={combined}
          emphasis="headline"
        />

        <div data-testid="cash-group">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cash
          </div>
          {cashAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cash drawers yet — add one under Banking → Cash drawer.
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border/80">
              {cashAccounts.map((account) => (
                <div
                  key={account.id}
                  data-testid="cash-drawer-row"
                  data-drawer-name={account.name}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <Link
                    href={`/banking/accounts/${account.id}`}
                    className="truncate text-sm font-medium text-primary hover:underline"
                  >
                    {account.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-sm font-semibold">
                    {formatTry(account.balance_kurus)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1.5 border-t border-border/80 pt-1.5">
            <MoneyRow
              label="Cash"
              amountKurus={cashKurus}
              href="/banking/cash"
              emphasis="subtotal"
            />
          </div>
        </div>

        <div data-testid="bank-group">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bank accounts
          </div>
          <BankAccountBalanceRows
            accounts={bankAccounts}
            variant="compact"
            className="border-t border-border/80"
          />
          <div className="mt-1.5 border-t border-border/80 pt-1.5">
            <MoneyRow
              label="Banks"
              amountKurus={bankKurus}
              href="/banking/banks"
              emphasis="subtotal"
            />
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        Each drawer and bank shows its book balance — open an account for
        statements, activity, and reconciliation.
      </p>
    </div>
  );
}
