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

type Props = {
  cashKurus: number;
  bankKurus: number;
};

export function CashBankSnapshotCard({ cashKurus, bankKurus }: Props) {
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
        <div className="flex items-baseline justify-between gap-4">
          <Link
            href="/banking/cash"
            className="text-muted-foreground hover:text-foreground"
          >
            Cash
          </Link>
          <Link
            href="/banking/cash"
            className="text-lg font-semibold tabular-nums hover:underline"
          >
            {formatTry(cashKurus)}
          </Link>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <Link
              href="/banking/banks"
              className="text-muted-foreground hover:text-foreground"
            >
              Bank accounts
            </Link>
            <Link
              href="/banking/banks"
              className="text-lg font-semibold tabular-nums hover:underline"
            >
              {formatTry(bankKurus)}
            </Link>
          </div>
          <BankAccountBalanceRows
            accounts={bankAccounts}
            variant="compact"
            className="border-t border-border/80"
          />
        </div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        Each bank shows its book balance — open an account for statements,
        activity, and reconciliation.
      </p>
    </div>
  );
}
