"use client";

import { Building2, Coins, CreditCard, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { TransferForm } from "@/components/forms/transfer-form";
import { HubPage } from "@/components/page/hub-page";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountTree } from "@/lib/banking-types";
import {
  accountCountLabel,
  accountSubtitle,
  allFxAccounts,
  cashDrawerHubSubtitle,
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
    <HubPage
      title="Banking"
      meta="Choose an area to view accounts, balances, and history."
      error={error}
      primaryAction={
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setTransferOpen(true)}
        >
          New transfer
        </Button>
      }
      tiles={
        tree
          ? [
              {
                key: "banks",
                href: "/banking/banks",
                icon: Building2,
                title: "Banks",
                amount: formatTryTileBalance(tree.banks.balance_kurus),
                subtitle: `${accountCountLabel(tree.banks.accounts.length, "account")} · ${accountSubtitle(tree.banks.accounts)}`,
              },
              {
                key: "cards",
                href: "/banking/cards",
                icon: CreditCard,
                title: "Credit cards",
                amount: formatTryTileBalance(
                  tree.credit_cards.balance_kurus,
                ),
                subtitle: `${accountCountLabel(tree.credit_cards.accounts.length, "card", "cards")} · ${accountSubtitle(tree.credit_cards.accounts)}`,
              },
              {
                key: "cash",
                href: "/banking/cash",
                icon: Wallet,
                title: "Cash drawer",
                amount: formatTryTileBalance(tree.cash.balance_kurus),
                subtitle: cashDrawerHubSubtitle(tree.cash.accounts),
              },
              {
                key: "fx",
                href: "/banking/fx",
                icon: Coins,
                title: "Foreign currency",
                amount: formatFxTileSummary(fxAccounts),
                subtitle: `${accountCountLabel(fxAccounts.length, "wallet", "wallets")} · ${accountSubtitle(fxAccounts)}`,
              },
            ]
          : undefined
      }
    >
      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {loading && <PageSkeleton />}

      {tree && tree.cash.accounts.length === 0 && (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No cash drawer for this restaurant — one is created automatically when
          you add a restaurant. If this is missing, open{" "}
          <Link href="/banking/cash" className="text-primary hover:underline">
            Cash drawer
          </Link>{" "}
          and use Add cash drawer.
        </p>
      )}

      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={() => void reload()}
      />
    </HubPage>
  );
}
