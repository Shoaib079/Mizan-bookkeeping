"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BankAccountBalanceRows } from "@/components/banking/bank-account-balance-rows";
import { useNewLookTheme } from "@/components/layout/new-look-toggle";
import { IconSquare } from "@/components/ui/icon-square";
import {
  ACCENT_BAR,
  MeaningCardAccentBar,
} from "@/components/ui/meaning-card";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountTree } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { THEME_V2_ATTR } from "@/lib/theme-v2";

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

/** v2-only: 13px / 700 / #3D4A63 — labels, not captions. */
const SUBTOTAL_LABEL_V2 =
  "text-[13px] font-bold text-[#3D4A63] hover:text-foreground hover:underline";
const SUBTOTAL_LABEL_V1 =
  "text-xs text-muted-foreground hover:text-foreground hover:underline";

function SubtotalRow({
  label,
  amountKurus,
  href,
  v2,
}: {
  label: string;
  amountKurus: number;
  href: string;
  v2: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Link
        href={href}
        data-testid="cash-bank-subtotal-label"
        data-label={label}
        className={v2 ? SUBTOTAL_LABEL_V2 : SUBTOTAL_LABEL_V1}
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
  const { theme } = useNewLookTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const [v2, setV2] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<
    MoneyAccountTree["banks"]["accounts"]
  >([]);

  // `theme` comes from shared subscribeVisualTheme (not local-only hook state),
  // so New look toggle re-runs this and refreshes v2 chrome without remount.
  // closest() also covers preview/test wrappers with local data-theme.
  useLayoutEffect(() => {
    setV2(Boolean(rootRef.current?.closest(`[data-theme="${THEME_V2_ATTR}"]`)));
  }, [theme]);

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
      ref={rootRef}
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
        className={
          v2
            ? "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] sm:gap-x-6"
            : "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
        }
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
              v2={v2}
            />
          </div>
        </div>

        {v2 ? (
          <div
            data-testid="cash-bank-column-divider"
            aria-hidden
            className="hidden w-px self-stretch bg-[#E6EAF2] sm:block"
          />
        ) : null}

        {v2 ? (
          <div
            data-testid="cash-bank-stack-divider"
            aria-hidden
            className="h-px w-full bg-[#E6EAF2] sm:hidden"
          />
        ) : null}

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
              v2={v2}
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
