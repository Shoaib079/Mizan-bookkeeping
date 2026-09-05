"use client";

/** Per-account sticker grid for Banks / Cards / Cash drawers — HubTileCard only. */

import type { ReactNode } from "react";

import { HubTileCard, type HubTile } from "@/components/page/hub-page";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";
import {
  moneyAccountsToHubTiles,
  type MoneyAccountHubTileFields,
} from "@/lib/money-account-stickers";
import { cn } from "@/lib/utils";

type Props = {
  accounts: MoneyAccountLeaf[];
  totalKurus: number;
  emptyHint: string;
  /** Optional intro above the total (cash drawers description). */
  intro?: ReactNode;
  /** Wrap each sticker (cash rename overlay). */
  renderTile?: (
    tile: MoneyAccountHubTileFields,
    account: MoneyAccountLeaf,
  ) => ReactNode;
  className?: string;
};

export function MoneyAccountStickerGrid({
  accounts,
  totalKurus,
  emptyHint,
  intro,
  renderTile,
  className,
}: Props) {
  const tiles = moneyAccountsToHubTiles(accounts);

  return (
    <section
      data-testid="money-account-sticker-grid"
      className={cn("space-y-3", className)}
    >
      {intro}
      <div
        data-testid="money-account-sticker-total"
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]"
      >
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span className="tabular-nums text-sm font-semibold">
          {formatTry(totalKurus)}
        </span>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile, i) => {
            const account = accounts[i]!;
            if (renderTile) return renderTile(tile, account);
            return <HubTileCard key={tile.key} tile={tile as HubTile} />;
          })}
        </div>
      )}
    </section>
  );
}
