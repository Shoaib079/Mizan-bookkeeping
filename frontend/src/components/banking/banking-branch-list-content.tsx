"use client";

import { useCallback, useEffect, useState } from "react";
import { BankAccountBalanceRow } from "@/components/banking/bank-account-balance-rows";
import { MoneyAccountForm } from "@/components/forms/money-account-form";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type {
  MoneyAccountKind,
  MoneyAccountLeaf,
  MoneyAccountTree,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";

type BranchKey = "banks" | "credit_cards";

type Props = {
  branchKey: BranchKey;
  defaultKind: MoneyAccountKind;
  title: string;
  emptyHint: string;
  addLabel: string;
};

function AccountRow({ account }: { account: MoneyAccountLeaf }) {
  return <BankAccountBalanceRow account={account} />;
}

export function BankingBranchListContent({
  branchKey,
  defaultKind,
  title,
  emptyHint,
  addLabel,
}: Props) {
  const { entityId } = useEntity();
  const [tree, setTree] = useState<MoneyAccountTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountFormOpen, setAccountFormOpen] = useState(false);

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

  const branch = tree?.[branchKey];

  return (
    <>
      <PageHeader
        title={title}
        meta={branch?.bucket_name_tr}
        primaryAction={
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setAccountFormOpen(true)}
          >
            {addLabel}
          </Button>
        }
      />

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {branch && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">
              Total
            </span>
            <span className="tabular-nums text-sm font-medium">
              {formatTry(branch.balance_kurus)}
            </span>
          </div>
          {branch.accounts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {emptyHint}
            </p>
          ) : (
            <div className="divide-y divide-border px-4">
              {branch.accounts.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </div>
          )}
        </section>
      )}

      <MoneyAccountForm
        open={accountFormOpen}
        onClose={() => setAccountFormOpen(false)}
        defaultKind={defaultKind}
        fixedKind={defaultKind}
        onSaved={() => void reload()}
      />
    </>
  );
}
