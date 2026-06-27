"use client";

/** Bank statement review + classify — Phase 9 Slice 4. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatementLineClassify } from "@/components/statement-line-classify";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import type { BankStatementRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate } from "@/lib/money";

export default function StatementDetailPage() {
  const params = useParams<{ id: string }>();
  const statementId = params.id;
  const { entityId } = useEntity();
  const [statement, setStatement] = useState<BankStatementRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetDetailState = useCallback(() => {
    setStatement(null);
    setLoading(true);
    setError(null);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !statementId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BankStatementRead>(
        `/entities/${entityId}/banking/statements/${statementId}`,
      );
      setStatement(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, statementId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entityId) {
    return (
      <AppShell title="Statement">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  const needsReview =
    statement?.lines.filter((l) => l.status === "needs_review") ?? [];
  const pending =
    statement?.lines.filter(
      (l) =>
        l.status !== "posted" &&
        l.status !== "linked" &&
        l.status !== "classified" &&
        l.status !== "needs_review",
    ) ?? [];
  const resolved =
    statement?.lines.filter(
      (l) =>
        l.status === "posted" ||
        l.status === "linked" ||
        l.status === "classified",
    ) ?? [];

  return (
    <AppShell title="Statement review">
      <div className="mb-4">
        <Link
          href={
            statement
              ? `/banking/accounts/${statement.money_account_id}`
              : "/banking"
          }
          className="text-sm text-primary hover:underline"
        >
          ← Account
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading statement…</p>
      )}

      {!loading && statement && (
        <>
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">{statement.original_filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatTrDate(statement.period_start)} –{" "}
              {formatTrDate(statement.period_end)} · {statement.line_count} lines
            </p>
            {needsReview.length > 0 && (
              <div className="mt-2">
                <StatusBadge status="needs_review" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {needsReview.length} line
                  {needsReview.length === 1 ? "" : "s"} need review
                </span>
              </div>
            )}
          </div>

          {needsReview.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-warning">
                Needs review
              </h2>
              <div className="space-y-3">
                {needsReview.map((line) => (
                  <StatementLineClassify
                    key={line.id}
                    statementId={statementId}
                    line={line}
                    onClassified={() => void reload()}
                  />
                ))}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold">Unclassified</h2>
              <div className="space-y-3">
                {pending.map((line) => (
                  <StatementLineClassify
                    key={line.id}
                    statementId={statementId}
                    line={line}
                    onClassified={() => void reload()}
                  />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Resolved</h2>
              <div className="space-y-3">
                {resolved.map((line) => (
                  <StatementLineClassify
                    key={line.id}
                    statementId={statementId}
                    line={line}
                    onClassified={() => void reload()}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
