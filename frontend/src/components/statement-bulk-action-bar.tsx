"use client";

/** Bulk post / correct bar for multiple selected bank statement lines. */

import { StatementBulkActionForm } from "@/components/statement-bulk-action-form";
import {
  useStatementBulkActionBar,
  type StatementBulkActionBarProps,
} from "@/components/use-statement-bulk-action-bar";
import { Button } from "@/components/ui/button";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type { StatementBulkActionBarProps };

export function StatementBulkActionBar(props: StatementBulkActionBarProps) {
  const s = useStatementBulkActionBar(props);

  if (!s.mode || props.lines.length === 0) return null;

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Bulk {s.mode === "post" ? "post" : "correct"} · {props.lines.length}{" "}
          selected
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs"
          disabled={s.submitting}
          onClick={s.onClearSelection}
        >
          Clear selection
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Same classification and targets apply to every selected line.
        {s.direction === "inflow" ? " Inflows only." : null}
        {s.direction === "outflow" ? " Outflows only." : null}{" "}
        <span className={cn("font-medium tabular-nums", s.amountClass)}>
          Net {formatTry(s.totalKurus)}
        </span>
      </p>

      {!s.selectionCheck.ok && (
        <p className="text-xs text-destructive">{s.selectionCheck.message}</p>
      )}

      <StatementBulkActionForm
        entityId={s.entityId}
        pickers={s.pickers}
        mode={s.mode}
        classification={s.classification}
        onClassificationChange={s.setClassification}
        amountSample={s.amountSample}
        targetValues={s.targetValues}
        learnAs={s.learnAs}
        onLearnAsChange={s.setLearnAs}
        correctReason={s.correctReason}
        onCorrectReasonChange={s.setCorrectReason}
        error={s.error}
        submitting={s.submitting}
        progress={s.progress}
        selectionCheck={s.selectionCheck}
        lineCount={props.lines.length}
        targetsStillRequired={s.targetsStillRequired}
        onSubmit={s.handleSubmit}
      />
    </div>
  );
}
