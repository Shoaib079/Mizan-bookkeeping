"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatementImportPanel } from "@/components/banking/statement-import-panel";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";

export default function StatementImportPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId } = useEntity();
  const [account, setAccount] = useState<MoneyAccountRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAccount(null);
    setLoading(true);
    setError(null);
  }, []);

  useEntitySwitchReset(entityId, reset);

  useEffect(() => {
    if (!entityId || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiFetch<MoneyAccountRead>(
      `/entities/${entityId}/banking/accounts/${accountId}`,
    )
      .then((acct) => {
        if (!cancelled) setAccount(acct);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, accountId]);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading account…</p>;
  }

  if (error || !account) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error ?? "Account not found"}</p>
        <Link href="/banking" className="text-sm text-primary hover:underline">
          ← Banking
        </Link>
      </div>
    );
  }

  if (account.account_kind !== "bank") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Statements can only be imported for bank accounts.
        </p>
        <Link
          href={`/banking/accounts/${accountId}`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to account
        </Link>
      </div>
    );
  }

  return (
    <StatementImportPanel
      moneyAccountId={accountId}
      accountName={account.name}
      backHref={`/banking/accounts/${accountId}`}
    />
  );
}
