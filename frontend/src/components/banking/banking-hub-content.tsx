"use client";

import { Building2, Coins, CreditCard, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BankingHubTile } from "@/components/banking/banking-hub-tile";
import { TransferForm } from "@/components/forms/transfer-form";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountTree } from "@/lib/banking-types";
import {
  accountCountLabel,
  accountSubtitle,
  allFxAccounts,
  formatFxTileSummary,
  formatTryTileBalance,
} from "@/lib/banking-tree-helpers";
import { useEntity } from "@/lib/entity-context";

export function BankingHubContent() {
  const { entityId } = useEntity();
  const [tree, setTree] = useState<MoneyAccountTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setTree(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MoneyAccountTree>(
        `/entities/${entityId}/banking/accounts/tree`,
      );
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fxAccounts = tree ? allFxAccounts(tree) : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Choose an area to view accounts, balances, and history.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={!entityId}
            onClick={() => setTransferOpen(true)}
          >
            New transfer
          </Button>
        </div>
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {tree && (
        <div className="grid gap-4 sm:grid-cols-2">
          <BankingHubTile
            href="/banking/banks"
            icon={Building2}
            title="Banks"
            balance={formatTryTileBalance(tree.banks.balance_kurus)}
            subtitle={`${accountCountLabel(tree.banks.accounts.length, "account")} · ${accountSubtitle(tree.banks.accounts)}`}
          />
          <BankingHubTile
            href="/banking/cards"
            icon={CreditCard}
            title="Credit cards"
            balance={formatTryTileBalance(tree.credit_cards.balance_kurus)}
            subtitle={`${accountCountLabel(tree.credit_cards.accounts.length, "card", "cards")} · ${accountSubtitle(tree.credit_cards.accounts)}`}
          />
          <BankingHubTile
            href="/banking/cash"
            icon={Wallet}
            title="Cash drawer"
            balance={formatTryTileBalance(tree.cash.balance_kurus)}
            subtitle={`${accountCountLabel(tree.cash.accounts.length, "drawer", "drawers")} · ${accountSubtitle(tree.cash.accounts)}`}
          />
          <BankingHubTile
            href="/banking/fx"
            icon={Coins}
            title="Foreign currency"
            balance={formatFxTileSummary(fxAccounts)}
            subtitle={`${accountCountLabel(fxAccounts.length, "wallet", "wallets")} · ${accountSubtitle(fxAccounts)}`}
          />
        </div>
      )}

      {tree && tree.cash.accounts.length === 0 && (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No cash drawer yet — add one from{" "}
          <Link href="/banking/cash" className="text-primary hover:underline">
            Cash drawer
          </Link>{" "}
          or Restaurant settings.
        </p>
      )}

      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={() => void reload()}
      />
    </>
  );
}
