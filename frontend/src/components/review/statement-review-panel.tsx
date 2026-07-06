"use client";

/** Bank & card statement line review — shared Review hub tab. */

import { useCallback, useEffect, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { StatementLineReviewRow } from "@/components/statement-line-review-row";
import type { StatementLineReview } from "@/lib/banking-types";
import { loadStatementReviewLines } from "@/lib/load-statement-review-lines";
import {
  countLinesByTab,
  filterLinesByDateRange,
  filterLinesByTab,
  STATEMENT_REVIEW_TABS,
} from "@/lib/statement-review";
import { useEntity } from "@/lib/entity-context";
import { invalidateReviewCounts } from "@/lib/review-counts-types";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useStatementReviewUrl } from "@/lib/use-statement-review-url";
import { cn } from "@/lib/utils";

export function StatementReviewPanel() {
  const { entityId } = useEntity();
  const { from, to, activeTab, setRange, setActiveTab } =
    useStatementReviewUrl();
  const [lines, setLines] = useState<StatementLineReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setLines([]);
    setLoading(true);
    setError(null);
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

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  const linesInRange = filterLinesByDateRange(lines, from, to);
  const tabCounts = countLinesByTab(linesInRange);
  const visibleLines = filterLinesByTab(linesInRange, activeTab);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Confirm suggestions, correct auto-posted lines, and manage suppliers inline.
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
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="ml-1.5 tabular-nums opacity-80">
              ({tabCounts[tab.id]})
            </span>
          </button>
        ))}
      </div>

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
            />
          ))}
        </div>
      )}
    </>
  );
}
