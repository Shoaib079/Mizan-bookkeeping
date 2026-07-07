"use client";

/** Bank & card statement line review — shared Review hub tab. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { StatementBulkActionBar } from "@/components/statement-bulk-action-bar";
import { StatementLineReviewRow } from "@/components/statement-line-review-row";
import type { ClassifyStatementLineResult, StatementLineReview } from "@/lib/banking-types";
import { loadStatementReviewLines } from "@/lib/load-statement-review-lines";
import {
  canBulkSelectLine,
  toggleAllLineIds,
  toggleLineIdSet,
} from "@/lib/statement-bulk-selection";
import {
  countLinesByTab,
  filterLinesByDateRange,
  filterLinesByTab,
  STATEMENT_REVIEW_TABS,
} from "@/lib/statement-review";
import { replaceStatementLine } from "@/lib/statement-line-filters";
import { useEntity } from "@/lib/entity-context";
import { invalidateReviewCounts } from "@/lib/review-counts-types";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useStatementReviewUrl } from "@/lib/use-statement-review-url";
import { useStatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { cn } from "@/lib/utils";

export function StatementReviewPanel() {
  const { entityId } = useEntity();
  const pickers = useStatementClassificationPickers(entityId);
  const { from, to, activeTab, setRange, setActiveTab } =
    useStatementReviewUrl();
  const [lines, setLines] = useState<StatementLineReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(
    () => new Set(),
  );

  const resetState = useCallback(() => {
    setLines([]);
    setLoading(true);
    setError(null);
    setSelectedLineIds(new Set());
  }, []);

  useEntitySwitchReset(entityId, resetState);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadStatementReviewLines(entityId, { from, to });
      setLines(loaded);
      invalidateReviewCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const linesInRange = filterLinesByDateRange(lines, from, to);
  const tabCounts = countLinesByTab(linesInRange);
  const visibleLines = filterLinesByTab(linesInRange, activeTab);

  const bulkSelectedLines = useMemo(
    () => visibleLines.filter((line) => selectedLineIds.has(line.id)),
    [selectedLineIds, visibleLines],
  );

  const selectableVisibleIds = useMemo(
    () => visibleLines.filter(canBulkSelectLine).map((line) => line.id),
    [visibleLines],
  );

  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedLineIds.has(id));

  const handleBulkLineDone = useCallback((result: ClassifyStatementLineResult) => {
    setLines((prev) => replaceStatementLine(prev, result.line));
    setSelectedLineIds((prev) => {
      if (!prev.has(result.line.id)) return prev;
      const next = new Set(prev);
      next.delete(result.line.id);
      return next;
    });
    invalidateReviewCounts();
  }, []);

  const showBulkBar = bulkSelectedLines.length > 0;

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Tick the box next to the date on each line to post or correct a batch with the
        same classification. Expand a row for one-at-a-time actions.
      </p>

      <div className="mb-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={setRange}
        />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {pickers.error && (
        <p className="mb-4 text-sm text-destructive">{pickers.error}</p>
      )}

      {showBulkBar && (
        <StatementBulkActionBar
          lines={bulkSelectedLines}
          pickers={pickers}
          onLineDone={handleBulkLineDone}
          onComplete={() => void reload()}
          onClearSelection={() => setSelectedLineIds(new Set())}
        />
      )}

      <div
        className="mb-6 flex flex-wrap gap-2 border-b border-border pb-2"
        role="tablist"
        aria-label="Statement line status filters"
      >
        {STATEMENT_REVIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedLineIds(new Set());
            }}
          >
            {tab.label}
            <span className="ml-1.5 tabular-nums opacity-80">
              ({tabCounts[tab.id]})
            </span>
          </button>
        ))}
      </div>

      {!loading && visibleLines.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={allVisibleSelected}
              disabled={selectableVisibleIds.length === 0}
              onChange={(e) =>
                setSelectedLineIds((prev) =>
                  toggleAllLineIds(prev, selectableVisibleIds, e.target.checked),
                )
              }
            />
            <span>Select all visible</span>
          </label>
          {selectedLineIds.size > 0 && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setSelectedLineIds(new Set())}
            >
              Clear {selectedLineIds.size} selected
            </button>
          )}
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Loading statement lines…</p>
      )}

      {!loading && visibleLines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No lines in this filter for the selected dates.
        </p>
      )}

      {!loading && visibleLines.length > 0 && (
        <div className="space-y-3">
          {visibleLines.map((line) => (
            <StatementLineReviewRow
              key={line.id}
              line={line}
              onUpdated={() => void reload()}
              bulkChecked={selectedLineIds.has(line.id)}
              bulkSelectable={canBulkSelectLine(line)}
              onToggleBulkChecked={(checked) => {
                setSelectedLineIds((prev) => toggleLineIdSet(prev, line.id, checked));
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
