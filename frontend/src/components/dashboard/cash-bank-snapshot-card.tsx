"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { BankAccountBalanceRows } from "@/components/banking/bank-account-balance-rows";
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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="size-4" /> Cash & bank
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
