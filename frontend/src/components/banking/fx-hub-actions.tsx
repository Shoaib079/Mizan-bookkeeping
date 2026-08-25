"use client";

/** Buy / Convert / Spend row for the FX hub. */

import { Button } from "@/components/ui/button";
import type { MoneyAccountLeaf } from "@/lib/banking-types";

export type FxHubActionsProps = {
  actionWallet: MoneyAccountLeaf | null;
  onBuy: () => void;
  onConvert: () => void;
  onSpend: () => void;
};

export function FxHubActions({
  actionWallet,
  onBuy,
  onConvert,
  onSpend,
}: FxHubActionsProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {actionWallet
          ? `${actionWallet.name} selected`
          : "Select a wallet to buy, convert, or spend."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!actionWallet} onClick={onBuy}>
          Buy
        </Button>
        <Button disabled={!actionWallet} onClick={onConvert}>
          Convert
        </Button>
        <Button disabled={!actionWallet} onClick={onSpend}>
          Spend
        </Button>
      </div>
    </div>
  );
}
