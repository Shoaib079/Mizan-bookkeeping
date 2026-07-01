"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatementImportPanel } from "@/components/banking/statement-import-panel";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  shouldStartAccountFetchLoading,
  statementImportPagePhase,
} from "@/lib/statement-import-page";
import { statementImportSessionKey } from "@/lib/statement-import-helpers";

export default function StatementImportPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId, entitiesLoaded } = useEntity();
  const [account, setAccount] = useState<MoneyAccountRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionValidated, setSessionValidated] = useState(false);
  const validatedSessionRef = useRef<string | null>(null);
  const prevSessionKeyRef = useRef<string | null>(null);

  const sessionKey =
    entityId && accountId ? statementImportSessionKey(entityId, accountId) : "";

  useEffect(() => {
    if (prevSessionKeyRef.current !== null && prevSessionKeyRef.current !== sessionKey) {
      validatedSessionRef.current = null;
      setSessionValidated(false);
      setAccount(null);
      setLoading(true);
      setError(null);
    }
    prevSessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    if (!entityId || !accountId || !entitiesLoaded) return;

    let cancelled = false;
    if (shouldStartAccountFetchLoading(validatedSessionRef.current === sessionKey)) {
      setLoading(true);
      setError(null);
    }

    void apiFetch<MoneyAccountRead>(
      `/entities/${entityId}/banking/accounts/${accountId}`,
    )
      .then((acct) => {
        if (cancelled) return;
        setAccount(acct);
        if (acct.account_kind === "bank") {
          validatedSessionRef.current = sessionKey;
          setSessionValidated(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entityId, accountId, entitiesLoaded, sessionKey]);

  const phase = statementImportPagePhase({
    entityId,
    entitiesLoaded,
    sessionValidated,
    loading,
    error,
  });

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (phase === "wait-entities" || phase === "wait-account") {
    return (
      <p className="text-sm text-muted-foreground">
        {phase === "wait-entities" ? "Loading restaurants…" : "Loading account…"}
      </p>
    );
  }

  if (phase === "error" || !account) {
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
