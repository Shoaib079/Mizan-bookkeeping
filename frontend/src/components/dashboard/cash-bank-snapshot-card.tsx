"use client";

/** Shared Cash & bank dashboard card — identical on v1 and v2 (no theme fork). */

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

function SubtotalRow({
  label,
  amountKurus,
  href,
}: {
  label: string;
  amountKurus: number;
  href: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Link
        href={href}
        data-testid="cash-bank-subtotal-label"
        data-label={label}
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {label}
      </Link>
      <Link
        href={href}
        className="text-sm font-semibold tabular-nums hover:underline"
      >
        {formatTry(amountKurus)}
      </Link>
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
    // Same shell as StatCard — meaning card + blue bar + sky icon (accepted-live both themes).
    <div
      data-meaning-card
      data-testid="cash-bank-snapshot-card"
      className="relative rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]"
      style={{ ["--accent-bar" as string]: ACCENT_BAR.blue }}
    >
      <MeaningCardAccentBar />
      <div
        data-testid="cash-bank-heading"
        className="flex items-center gap-2 text-sm font-medium text-foreground"
      >
        <IconSquare icon={Wallet} tint="sky" stroke="blue" size="sm" />
        Cash & bank
      </div>
      <div data-testid="cash-bank-total" className="mt-3 w-full min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            data-testid="cash-bank-total-label"
            className="text-[13px] font-semibold text-[#3D4A63]"
          >
            Total balance
          </span>
          <span
            data-testid="cash-bank-as-of-hint"
            className="text-xs text-muted-foreground"
          >
            as of today
          </span>
        </div>
        <p
          data-testid="cash-bank-total-figure"
          className="mt-1 w-full text-[20px] font-extrabold tabular-nums text-[#0B1526]"
        >
          {formatTry(combined)}
        </p>
      </div>

      <div
        data-testid="cash-bank-columns"
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
      >
        <div data-testid="cash-group" className="min-w-0">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cash drawers
          </div>
          {cashAccounts.length === 0 ? (
            <p className="border-t border-border/80 pt-1.5 text-xs text-muted-foreground">
              No cash drawers yet.
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border/80">
              {cashAccounts.map((account) => (
                <div
                  key={account.id}
                  data-testid="cash-drawer-row"
                  data-drawer-name={account.name}
                  className="flex items-center justify-between gap-2 py-1"
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
          <div className="mt-1 border-t border-border/80 pt-1">
            <SubtotalRow
              label="Cash"
              amountKurus={cashKurus}
              href="/banking/cash"
            />
          </div>
        </div>

        <div data-testid="bank-group" className="min-w-0">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bank accounts
          </div>
          <BankAccountBalanceRows
            accounts={bankAccounts}
            variant="compact"
            className="border-t border-border/80"
          />
          <div className="mt-1 border-t border-border/80 pt-1">
            <SubtotalRow
              label="Banks"
              amountKurus={bankKurus}
              href="/banking/banks"
            />
          </div>
        </div>
      </div>

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        Book balances — open an account for statements and reconciliation.
      </p>
    </div>
  );
}
