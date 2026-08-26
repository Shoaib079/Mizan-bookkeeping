"use client";

/** Shared Cash & bank dashboard card — two aligned columns + hairline. */

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
  /** When false, names and subtotals are display-only (no links). */
  interactive?: boolean;
};

/** Shared column header + account-row rhythm (cash and bank match). */
const COL_HEADER =
  "mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground";
const ACCOUNT_ROW =
  "flex items-center justify-between gap-3 py-1.5";
/** Accepted-live Cash / Banks subtotal labels (owner-approved; restored after parity muted them). */
const SUBTOTAL_LABEL =
  "text-[13px] font-bold text-ink-soft hover:text-foreground hover:underline";

function SubtotalRow({
  label,
  amountKurus,
  href,
  interactive,
}: {
  label: string;
  amountKurus: number;
  href: string;
  interactive: boolean;
}) {
  const amount = (
    <span className="text-sm font-semibold tabular-nums">
      {formatTry(amountKurus)}
    </span>
  );
  if (!interactive) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span
          data-testid="cash-bank-subtotal-label"
          data-label={label}
          className="text-[13px] font-bold text-ink-soft"
        >
          {label}
        </span>
        {amount}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Link
        href={href}
        data-testid="cash-bank-subtotal-label"
        data-label={label}
        className={SUBTOTAL_LABEL}
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
  interactive = true,
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
    // Same shell as StatCard — meaning card + blue bar + sky icon (accepted-live).
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
            className="text-[13px] font-semibold text-ink-soft"
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
          className="mt-1 w-full text-[20px] font-extrabold tabular-nums text-ink-strong"
        >
          {formatTry(combined)}
        </p>
      </div>

      <div
        data-testid="cash-bank-columns"
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] sm:gap-x-6"
      >
        <div
          data-testid="cash-group"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <div
            data-testid="cash-bank-col-header"
            data-side="cash"
            className={COL_HEADER}
          >
            Cash drawers
          </div>
          {cashAccounts.length === 0 ? (
            <p className="flex-1 border-t border-border/80 pt-1.5 text-xs text-muted-foreground">
              No cash drawers yet.
            </p>
          ) : (
            <div className="flex-1 divide-y divide-border border-t border-border/80">
              {cashAccounts.map((account) => (
                <div
                  key={account.id}
                  data-testid="cash-drawer-row"
                  data-drawer-name={account.name}
                  className={ACCOUNT_ROW}
                >
                  {interactive ? (
                    <Link
                      href={`/banking/accounts/${account.id}`}
                      className="truncate text-sm font-medium text-primary hover:underline"
                    >
                      {account.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-foreground">
                      {account.name}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums text-sm font-semibold">
                    {formatTry(account.balance_kurus)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto border-t border-border/80 pt-1">
            <SubtotalRow
              label="Cash"
              amountKurus={cashKurus}
              href="/banking/cash"
              interactive={interactive}
            />
          </div>
        </div>

        <div
          data-testid="cash-bank-column-divider"
          aria-hidden
          className="hidden w-px self-stretch bg-rule-soft sm:block"
        />

        <div
          data-testid="cash-bank-stack-divider"
          aria-hidden
          className="h-px w-full bg-rule-soft sm:hidden"
        />

        <div
          data-testid="bank-group"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <div
            data-testid="cash-bank-col-header"
            data-side="bank"
            className={COL_HEADER}
          >
            Bank accounts
          </div>
          <BankAccountBalanceRows
            accounts={bankAccounts}
            variant="compact"
            interactive={interactive}
            className={cn("flex-1 border-t border-border/80")}
          />
          <div className="mt-auto border-t border-border/80 pt-1">
            <SubtotalRow
              label="Banks"
              amountKurus={bankKurus}
              href="/banking/banks"
              interactive={interactive}
            />
          </div>
        </div>
      </div>

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {interactive
          ? "Book balances — open an account for statements and reconciliation."
          : "Book balances as of today."}
      </p>
    </div>
  );
}
