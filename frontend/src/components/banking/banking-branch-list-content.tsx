"use client";

import { useCallback, useEffect, useState } from "react";

import { MoneyAccountStickerGrid } from "@/components/banking/money-account-sticker-grid";
import { MoneyAccountForm } from "@/components/forms/money-account-form";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type {
  MoneyAccountKind,
  MoneyAccountTree,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";

type BranchKey = "banks" | "credit_cards";

type Props = {
  branchKey: BranchKey;
  defaultKind: MoneyAccountKind;
  title: string;
  emptyHint: string;
  addLabel: string;
};

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
      <PageSkeleton when={loading} />

      {branch && (
        <MoneyAccountStickerGrid
          accounts={branch.accounts}
          totalKurus={branch.balance_kurus}
          emptyHint={emptyHint}
        />
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
