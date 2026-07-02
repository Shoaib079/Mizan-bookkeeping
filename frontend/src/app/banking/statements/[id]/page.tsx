"use client";

/** Bank statement — one-bar classify queue + full line ledger below. */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatementClassifyBar } from "@/components/statement-classify-bar";
import { StatementLinesLedger } from "@/components/statement-lines-ledger";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import type { BankStatementRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate } from "@/lib/money";
import { canDiscardStatement, queueLines } from "@/lib/statement-line-filters";
import { useStatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";

export default function StatementDetailPage() {
  const params = useParams<{ id: string }>();
  const statementId = params.id;
  const router = useRouter();
  const { entityId } = useEntity();
  const pickers = useStatementClassificationPickers(entityId);
  const [statement, setStatement] = useState<BankStatementRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const discardKeyRef = useRef<string | null>(null);

  const resetDetailState = useCallback(() => {
    setStatement(null);
    setLoading(true);
    setError(null);
    setSelectedLineId(null);
    setDiscardOpen(false);
    setDiscarding(false);
    discardKeyRef.current = null;
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

  const queue = useMemo(
    () => (statement ? queueLines(statement.lines) : []),
    [statement],
  );

  const barLine = useMemo(() => {
    if (!statement) return null;
    if (selectedLineId) {
      return statement.lines.find((line) => line.id === selectedLineId) ?? queue[0] ?? null;
    }
    return queue[0] ?? null;
  }, [statement, selectedLineId, queue]);

  const queueIndex = barLine ? queue.findIndex((line) => line.id === barLine.id) : -1;

  const handlePosted = useCallback(() => {
    setSelectedLineId(null);
    void reload();
  }, [reload]);

  const discardAllowed = useMemo(
    () => (statement ? canDiscardStatement(statement.lines) : false),
    [statement],
  );

  const openDiscardDialog = useCallback(() => {
    discardKeyRef.current = crypto.randomUUID();
    setDiscardOpen(true);
  }, []);

  const handleDiscard = useCallback(async () => {
    if (!entityId || !statementId || !statement || discarding) return;
    if (!discardKeyRef.current) {
      discardKeyRef.current = crypto.randomUUID();
    }
    setDiscarding(true);
    setError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/banking/statements/${statementId}`,
        {
          method: "DELETE",
          idempotencyKey: discardKeyRef.current,
        },
      );
      setDiscardOpen(false);
      router.push(`/banking/accounts/${statement.money_account_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard failed");
      setDiscarding(false);
    }
  }, [discarding, entityId, router, statement, statementId]);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{statement.original_filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTrDate(statement.period_start)} –{" "}
                  {formatTrDate(statement.period_end)} · {statement.line_count} imported
                  lines
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={!discardAllowed || discarding}
                onClick={openDiscardDialog}
              >
                Discard import
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Classify one line at a time in the bar below — Post moves to the next
              transaction. Every posted line creates a debit/credit journal entry.
            </p>
            {!discardAllowed && (
              <p className="mt-2 text-xs text-muted-foreground">
                This import cannot be discarded while lines are posted or linked to the
                ledger. Void or correct them in Review first.
              </p>
            )}
          </div>

          <Dialog
            open={discardOpen}
            title="Discard this statement import?"
            onClose={() => {
              if (!discarding) setDiscardOpen(false);
            }}
          >
            <p className="text-sm text-muted-foreground">
              Removes only this file and its unposted lines from Mizan. Your company,
              chart of accounts, suppliers, other statements, and any ledger entries
              already posted stay untouched. You can upload the same file again
              afterward (for example with merged bank descriptions).
            </p>
            <p className="mt-2 text-sm font-medium">{statement.original_filename}</p>
            <p className="text-xs text-muted-foreground">
              {statement.line_count} lines will be removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={discarding}
                onClick={() => setDiscardOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={discarding}
                onClick={() => void handleDiscard()}
              >
                {discarding ? "Discarding…" : "Discard import"}
              </Button>
            </div>
          </Dialog>

          <StatementClassifyBar
            statementId={statementId}
            line={barLine}
            queueIndex={queueIndex >= 0 ? queueIndex : 0}
            queueTotal={queue.length}
            pickers={pickers}
            onPosted={handlePosted}
          />

          <StatementLinesLedger
            lines={statement.lines}
            selectedLineId={barLine?.id ?? null}
            skippedDuplicateCount={statement.skipped_duplicate_count}
            onSelectLine={setSelectedLineId}
          />
        </>
      )}
    </>
  );
}
