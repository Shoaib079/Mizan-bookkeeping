"use client";

/** Active cash drawers as stickers — same HubTileCard chrome as banks/cards. */

import { HubTileCard } from "@/components/page/hub-page";
import { MoneyAccountStickerGrid } from "@/components/banking/money-account-sticker-grid";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import type { MoneyAccountHubTileFields } from "@/lib/money-account-stickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTry } from "@/lib/money";

export type CashDrawersListProps = {
  cashAccounts: MoneyAccountLeaf[];
  renamingId: string | null;
  renameText: string;
  renameError: string | null;
  renaming: boolean;
  onRenameTextChange: (value: string) => void;
  onStartRename: (account: MoneyAccountLeaf) => void;
  onCancelRename: () => void;
  onSaveRename: (accountId: string) => void;
};

export function CashDrawersList({
  cashAccounts,
  renamingId,
  renameText,
  renameError,
  renaming,
  onRenameTextChange,
  onStartRename,
  onCancelRename,
  onSaveRename,
}: CashDrawersListProps) {
  if (cashAccounts.length === 0) return null;

  const totalKurus = cashAccounts.reduce(
    (sum, account) => sum + account.balance_kurus,
    0,
  );

  return (
    <MoneyAccountStickerGrid
      className="mb-6"
      accounts={cashAccounts}
      totalKurus={totalKurus}
      emptyHint="No cash drawers yet."
      intro={
        <div className="px-0.5">
          <h2 className="text-sm font-semibold">Cash drawers</h2>
          <p className="text-xs text-muted-foreground">
            {cashAccounts.length === 1
              ? "One TRY drawer — created automatically with the restaurant."
              : `${cashAccounts.length} drawers — choose which one when recording cash.`}
          </p>
        </div>
      }
      renderTile={(tile: MoneyAccountHubTileFields, account: MoneyAccountLeaf) => {
        if (renamingId === account.id) {
          return (
            <div
              key={account.id}
              data-testid="cash-drawer-rename"
              className="relative rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={renameText}
                  onChange={(e) => onRenameTextChange(e.target.value)}
                  className="max-w-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onSaveRename(account.id);
                    }
                    if (e.key === "Escape") onCancelRename();
                  }}
                />
                <Button
                  type="button"
                  disabled={renaming}
                  onClick={() => void onSaveRename(account.id)}
                >
                  {renaming ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onCancelRename}
                >
                  Cancel
                </Button>
              </div>
              {renameError && (
                <p className="mt-2 text-xs text-destructive">{renameError}</p>
              )}
              <p className="mt-3 text-lg font-semibold tabular-nums">
                {formatTry(account.balance_kurus)}
              </p>
            </div>
          );
        }

        return (
          <div key={account.id} className="relative">
            <HubTileCard tile={tile} />
            <Button
              type="button"
              variant="ghost"
              className="absolute right-2 top-2 z-10 h-8 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartRename(account);
              }}
            >
              Rename
            </Button>
          </div>
        );
      }}
    />
  );
}
