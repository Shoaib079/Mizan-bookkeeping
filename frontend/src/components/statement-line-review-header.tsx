"use client";

/** Summary header for StatementLineReviewRow (description, amount, badge). */

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatementLineReview } from "@/lib/banking-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { classificationLabel } from "@/lib/statement-classification-options";

type Props = {
  line: StatementLineReview;
  isRuleAuto: boolean;
  canAct: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  bulkChecked?: boolean;
  bulkSelectable?: boolean;
  onToggleBulkChecked?: (checked: boolean) => void;
};

export function StatementLineReviewHeader({
  line,
  isRuleAuto,
  canAct,
  expanded,
  onToggleExpanded,
  bulkChecked = false,
  bulkSelectable = false,
  onToggleBulkChecked,
}: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{line.description}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-border"
            checked={bulkChecked}
            disabled={!bulkSelectable}
            aria-label={`Select ${line.description}`}
            onChange={(e) => onToggleBulkChecked?.(e.target.checked)}
          />
          <span>
            {formatTrDate(line.transaction_date)}
            {line.reference && ` · ${line.reference}`}
            {line.original_filename && ` · ${line.original_filename}`}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {classificationLabel(line.classification)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums text-sm font-medium">
          {formatTry(line.amount_kurus)}
        </span>
        <StatusBadge status={line.status} />
        {isRuleAuto && (
          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Auto rule
          </span>
        )}
        {canAct && (
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2"
            onClick={onToggleExpanded}
          >
            {expanded ? "Collapse" : "Actions"}
          </Button>
        )}
      </div>
    </div>
  );
}
