"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { formatTry } from "@/lib/money";

type Props = {
  cashKurus: number;
  bankKurus: number;
};

export function CashBankSnapshotCard({ cashKurus, bankKurus }: Props) {
  return (
    <Link
      href="/banking"
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="size-4" /> Cash & bank
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">Cash</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatTry(cashKurus)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">Bank</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatTry(bankKurus)}
          </span>
        </div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        TRY drawers and bank accounts — open Banking for statements and transfers.
      </p>
    </Link>
  );
}
