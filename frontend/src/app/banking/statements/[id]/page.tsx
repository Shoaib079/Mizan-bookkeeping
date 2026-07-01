"use client";

/** Bank statement review + classify — dense table layout. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatementLinesTable } from "@/components/statement-lines-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import type { BankStatementRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate } from "@/lib/money";
import { useStatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";

export default function StatementDetailPage() {
  const params = useParams<{ id: string }>();
  const statementId = params.id;
  const { entityId } = useEntity();
  const pickers = useStatementClassificationPickers(entityId);
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
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
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

  const onClassified = () => void reload();

  return (
    <>
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
      {pickers.error && (
        <p className="mb-4 text-sm text-destructive">{pickers.error}</p>
      )}

      {!loading && statement && (
        <>
          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">{statement.original_filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatTrDate(statement.period_start)} –{" "}
              {formatTrDate(statement.period_end)} · {statement.line_count} lines
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Each row matches your bank export. Pick classification and link
              (supplier, delivery platform, etc.), then Classify. Inflows include
              delivery app and POS settlements.
            </p>
            {needsReview.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status="needs_review" />
                <span className="text-sm text-muted-foreground">
                  {needsReview.length} line
                  {needsReview.length === 1 ? "" : "s"} need review
                </span>
              </div>
            )}
          </div>

          {needsReview.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-warning">
                Needs review ({needsReview.length})
              </h2>
              <StatementLinesTable
                statementId={statementId}
                lines={needsReview}
                pickers={pickers}
                onClassified={onClassified}
              />
            </section>
          )}

          {pending.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold">
                Unclassified ({pending.length})
              </h2>
              <StatementLinesTable
                statementId={statementId}
                lines={pending}
                pickers={pickers}
                onClassified={onClassified}
              />
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                Resolved ({resolved.length})
              </h2>
              <StatementLinesTable
                statementId={statementId}
                lines={resolved}
                pickers={pickers}
                onClassified={onClassified}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
