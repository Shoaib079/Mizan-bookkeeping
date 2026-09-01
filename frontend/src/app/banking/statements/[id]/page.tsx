"use client";

/** Bank statement — one-bar classify queue + full line ledger below. */

import { PageHeader } from "@/components/page/page-header";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatementClassifyBar } from "@/components/statement-classify-bar";
import { StatementBounceDialog } from "@/components/statement-bounce-dialog";
import { StatementBulkActionBar } from "@/components/statement-bulk-action-bar";
import { StatementLinesLedger } from "@/components/statement-lines-ledger";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import type {
  BankStatementRead,
  ClassifyStatementLineResult,
  StatementBouncePairResult,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate } from "@/lib/money";
import {
  defaultStatementLineFilter,
  isQueueLine,
  queueLines,
  replaceStatementLine,
  statementDiscardBlockers,
} from "@/lib/statement-line-filters";
import {
  toggleAllLineIds,
  toggleLineIdSet,
} from "@/lib/statement-bulk-selection";
import { useStatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

export default function StatementDetailPage() {
  const params = useParams<{ id: string }>();
  const statementId = params.id;
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const pickers = useStatementClassificationPickers(entityId);
  const [statement, setStatement] = useState<BankStatementRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(() => new Set());
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [bounceOpen, setBounceOpen] = useState(false);
  const discardKeyRef = useRef<string | null>(null);

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

  const ledgerDefaultFilter = useMemo(
    () => (statement ? defaultStatementLineFilter(statement.lines) : "queue"),
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

  const handlePosted = useCallback((result: ClassifyStatementLineResult) => {
    setSelectedLineId(null);
    setSelectedLineIds((prev) => {
      if (!prev.has(result.line.id)) return prev;
      const next = new Set(prev);
      next.delete(result.line.id);
      return next;
    });
    setStatement((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: replaceStatementLine(prev.lines, result.line),
      };
    });
  }, []);

  const handleBounceRecorded = useCallback((result: StatementBouncePairResult) => {
    setSelectedLineId(null);
    setSelectedLineIds(new Set());
    setStatement((prev) => {
      if (!prev) return prev;
      let lines = prev.lines;
      for (const updated of result.lines) {
        lines = replaceStatementLine(lines, updated);
      }
      return { ...prev, lines };
    });
  }, []);

  const bounceReturn =
    barLine && isQueueLine(barLine) && barLine.amount_kurus > 0 ? barLine : null;

  const bulkSelectedLines = useMemo(() => {
    if (!statement || selectedLineIds.size === 0) return [];
    return statement.lines.filter((line) => selectedLineIds.has(line.id));
  }, [statement, selectedLineIds]);

  const showBulkBar = bulkSelectedLines.length > 0;

  const discardBlockers = useMemo(
    () => (statement ? statementDiscardBlockers(statement.lines) : []),
    [statement],
  );
  const discardAllowed = statement != null && discardBlockers.length === 0;

  const openDiscardDialog = useCallback(() => {
    discardKeyRef.current = crypto.randomUUID();
    setDiscardError(null);
    setDiscardOpen(true);
  }, []);

  const handleDiscard = useCallback(async () => {
    if (!entityId || !statementId || !statement || discarding) return;
    if (!discardKeyRef.current) {
      discardKeyRef.current = crypto.randomUUID();
    }
    setDiscarding(true);
    setDiscardError(null);
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
      /* Into the dialog, not the page.
       *
       * This used to set the page-level `error`, which renders above the
       * summary card — behind the modal that is still open. The backend
       * refuses with a 409 when lines are in the ledger, and the whole
       * explanation landed somewhere nobody could see: you pressed the button
       * and nothing happened. */
      setDiscardError(err instanceof Error ? err.message : "Discard failed");
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

  /* One scroll area, not two.
   *
   * The page used to scroll *and* the line table had its own 65vh scrollbar,
   * with the classify bar pinned over the seam. Scroll far enough and the
   * table's sticky header rode up over the bar and covered the classification
   * pickers and the Post button — both were `sticky top-0 z-10`, so paint
   * order fell to whichever came later in the DOM, and that is the table.
   *
   * Now the page is a fixed column: header, summary, bar, and the table takes
   * exactly the room left and scrolls inside itself. Nothing is sticky here,
   * so nothing can be covered, and the table keeps its own column headings
   * because it no longer moves. */
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Bank statement"
        actions={
          statement && (
            <Link
              href={`/banking/accounts/${statement.money_account_id}`}
              className="text-sm text-primary hover:underline"
            >
              Open account
            </Link>
          )
        }
      />

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
              {/* The reason sits under the button it explains. It used to be a
                  paragraph further down the card, so a faded button with no
                  attached cause read as one that had simply stopped working. */}
              <div className="flex max-w-sm flex-col items-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={!discardAllowed || discarding}
                  onClick={openDiscardDialog}
                >
                  Discard import
                </Button>
                {!discardAllowed && (
                  <p className="text-right text-xs text-muted-foreground">
                    {discardBlockers.length} of {statement.line_count} lines are
                    already in the ledger, so removing the file would leave those
                    entries with nothing behind them. Tick them below and use
                    Correct → &ldquo;Decide later&rdquo; to void the entries, then
                    discard.
                  </p>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tick lines next to the date to post or correct a batch. Click a row for
              one-at-a-time classification in the bar below.
            </p>
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
            {discardError && (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {discardError}
              </p>
            )}
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

          {showBulkBar ? (
            <StatementBulkActionBar
              lines={bulkSelectedLines}
              pickers={pickers}
              onLineDone={handlePosted}
              onComplete={() => {
                if (selectedLineIds.size === 0) return;
              }}
              onClearSelection={() => {
                setSelectedLineIds(new Set());
              }}
            />
          ) : (
            <>
              {bounceReturn ? (
                <div className="mb-2 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    onClick={() => setBounceOpen(true)}
                  >
                    Payment bounced…
                  </Button>
                </div>
              ) : null}
              <StatementClassifyBar
                statementId={statementId}
                line={barLine}
                queueIndex={queueIndex >= 0 ? queueIndex : 0}
                queueTotal={queue.length}
                pickers={pickers}
                onPosted={handlePosted}
              />
              {bounceReturn ? (
                <StatementBounceDialog
                  open={bounceOpen}
                  onClose={() => setBounceOpen(false)}
                  entityId={entityId}
                  statementId={statementId}
                  returnLine={bounceReturn}
                  lines={statement.lines}
                  pickers={pickers}
                  actorId={actorId}
                  onRecorded={handleBounceRecorded}
                />
              ) : null}
            </>
          )}

          <StatementLinesLedger
            key={statementId}
            lines={statement.lines}
            selectedLineId={barLine?.id ?? null}
            skippedDuplicateCount={statement.skipped_duplicate_count}
            defaultFilter={ledgerDefaultFilter}
            onSelectLine={setSelectedLineId}
            selectedLineIds={selectedLineIds}
            onToggleLineChecked={(lineId, checked) => {
              setSelectedLineIds((prev) => toggleLineIdSet(prev, lineId, checked));
            }}
            onSelectAllVisible={(lineIds, select) => {
              setSelectedLineIds((prev) => toggleAllLineIds(prev, lineIds, select));
            }}
            onClearSelection={() => setSelectedLineIds(new Set())}
          />
        </>
      )}
    </div>
  );
}
