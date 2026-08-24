"use client";

/** Active cash drawers with inline rename. */

import type { MoneyAccountLeaf } from "@/lib/banking-types";
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

  return (
    <section className="mb-6 rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Cash drawers</h2>
        <p className="text-xs text-muted-foreground">
          {cashAccounts.length === 1
            ? "One TRY drawer — created automatically with the restaurant."
            : `${cashAccounts.length} drawers — choose which one when recording cash.`}
        </p>
      </div>
      <ul className="divide-y divide-border px-4">
        {cashAccounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            {renamingId === account.id ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                <Button type="button" variant="secondary" onClick={onCancelRename}>
                  Cancel
                </Button>
                {renameError && (
                  <p className="w-full text-xs text-destructive">{renameError}</p>
                )}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-medium">{account.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onStartRename(account)}
                >
                  Rename
                </Button>
              </div>
            )}
            <span className="tabular-nums">
              {formatTry(account.balance_kurus)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
