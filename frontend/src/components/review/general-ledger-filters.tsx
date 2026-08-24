"use client";

/** Date range, export, search, source, status, history for GL panel. */

import { GeneralLedgerExportMenu } from "@/components/review/general-ledger-export-menu";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { JOURNAL_SOURCES, sourceLabel } from "@/lib/transaction-registry";

export type GeneralLedgerFiltersProps = {
  entityId: string;
  from: string;
  to: string;
  q: string;
  source: string;
  status: string;
  showHistory: boolean;
  searchDraft: string;
  loading: boolean;
  onRangeChange: (from: string, to: string) => void;
  onSearchDraftChange: (value: string) => void;
  onApplySearch: () => void;
  onSetParams: (updates: Record<string, string | null>) => void;
};

export function GeneralLedgerFilters({
  entityId,
  from,
  to,
  q,
  source,
  status,
  showHistory,
  searchDraft,
  loading,
  onRangeChange,
  onSearchDraftChange,
  onApplySearch,
  onSetParams,
}: GeneralLedgerFiltersProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ReportDateRange
          allowFuture
          from={from}
          to={to}
          disabled={loading}
          onChange={onRangeChange}
        />
        <GeneralLedgerExportMenu
          entityId={entityId}
          from={from}
          to={to}
          q={q}
          source={source}
          status={status}
          showHistory={showHistory}
          disabled={loading}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="ledger-search">Search description</Label>
          <Input
            id="ledger-search"
            className="mt-1"
            value={searchDraft}
            disabled={loading}
            placeholder="Filter by description…"
            onChange={(e) => onSearchDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApplySearch();
            }}
          />
        </div>
        <div>
          <Label htmlFor="ledger-source">Source</Label>
          <Select
            id="ledger-source"
            className="mt-1 w-44"
            value={source}
            disabled={loading}
            onChange={(e) =>
              onSetParams({
                source: e.target.value || null,
                offset: "0",
                focus: null,
              })
            }
          >
            <option value="">All sources</option>
            {JOURNAL_SOURCES.map((value) => (
              <option key={value} value={value}>
                {sourceLabel(value)}
              </option>
            ))}
          </Select>
        </div>
        {showHistory && (
          <div>
            <Label htmlFor="ledger-status">Status</Label>
            <Select
              id="ledger-status"
              className="mt-1 w-36"
              value={status}
              disabled={loading}
              onChange={(e) =>
                onSetParams({
                  status: e.target.value || null,
                  offset: "0",
                  focus: null,
                })
              }
            >
              <option value="">All</option>
              <option value="posted">Posted</option>
              <option value="voided">Voided</option>
            </Select>
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          onClick={onApplySearch}
        >
          Apply search
        </Button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showHistory}
            disabled={loading}
            className="h-4 w-4 rounded border-border"
            onChange={(e) =>
              onSetParams({
                history: e.target.checked ? "1" : null,
                status: null,
                offset: "0",
                focus: null,
              })
            }
          />
          Show voids &amp; corrections
        </label>
      </div>
    </div>
  );
}
