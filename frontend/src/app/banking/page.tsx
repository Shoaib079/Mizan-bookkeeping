"use client";

/** Banking hub — account tree + balances — Phase 9 Slice 4. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MoneyAccountForm } from "@/components/forms/money-account-form";
import { TransferForm } from "@/components/forms/transfer-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type {
  MoneyAccountBranch,
  MoneyAccountLeaf,
  MoneyAccountTree,
} from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";

function AccountRow({ account }: { account: MoneyAccountLeaf }) {
  const href =
    account.account_kind === "foreign_currency"
      ? `/banking/fx/${account.id}`
      : `/banking/accounts/${account.id}`;

  return (
    <div className="flex items-center justify-between gap-4 py-2 pl-4">
      <Link href={href} className="text-sm text-primary hover:underline">
        {account.name}
        {account.last_four && ` ···${account.last_four}`}
      </Link>
      <span className="tabular-nums text-sm">
        {account.account_kind === "foreign_currency" &&
        account.currency &&
        account.native_quantity !== null
          ? formatFxNative(account.native_quantity, account.currency)
          : formatTry(account.balance_kurus)}
      </span>
    </div>
  );
}

function BranchSection({
  branch,
  emptyHint,
}: {
  branch: MoneyAccountBranch;
  emptyHint: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{branch.bucket_name_en}</h2>
          <p className="text-xs text-muted-foreground">{branch.bucket_name_tr}</p>
        </div>
        <span className="tabular-nums text-sm font-medium">
          {formatTry(branch.balance_kurus)}
        </span>
      </div>
      {branch.accounts.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="divide-y divide-border px-4">
          {branch.accounts.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function BankingPage() {
  const { entityId } = useEntity();
  const [tree, setTree] = useState<MoneyAccountTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
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

  return (
    <AppShell title="Banking">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Link href="/banking/transfers">
            <Button variant="secondary" type="button">
              Transfers
            </Button>
          </Link>
          <Link href="/banking/cash">
            <Button variant="secondary" type="button">
              Cash drawer
            </Button>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={!entityId}
            onClick={() => setTransferOpen(true)}
          >
            New transfer
          </Button>
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setAccountFormOpen(true)}
          >
            New account
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

      {tree && tree.cash.accounts.length === 0 && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Set up your cash drawer — seed the chart from Settings → Entity, or
          add a cash account with New account.
        </p>
      )}

      {tree && (
        <div className="space-y-4">
          <BranchSection
            branch={tree.banks}
            emptyHint="No bank accounts yet."
          />
          <BranchSection
            branch={tree.cash}
            emptyHint="No cash accounts yet."
          />
          <BranchSection
            branch={tree.credit_cards}
            emptyHint="No credit cards yet."
          />
          <div className="space-y-4">
            <p className="text-sm font-semibold">Foreign currency wallets</p>
            <BranchSection
              branch={tree.foreign_currency.usd}
              emptyHint="No USD wallets."
            />
            <BranchSection
              branch={tree.foreign_currency.eur}
              emptyHint="No EUR wallets."
            />
            <BranchSection
              branch={tree.foreign_currency.gbp}
              emptyHint="No GBP wallets."
            />
          </div>
        </div>
      )}

      <MoneyAccountForm
        open={accountFormOpen}
        onClose={() => setAccountFormOpen(false)}
        onSaved={() => void reload()}
      />
      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={() => void reload()}
      />
    </AppShell>
  );
}
