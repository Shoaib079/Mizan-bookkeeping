"use client";

import { FormEvent } from "react";

import { ClassificationPicker } from "@/components/banking/classification-picker";
import {
  StatementClassifyTargetControl,
  type StatementClassifyTargetValues,
} from "@/components/statement-classify-target-control";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { StatementLineClassification } from "@/lib/banking-types";
import type { StatementBulkMode } from "@/lib/statement-bulk-selection";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

type SelectionCheck =
  | { ok: true }
  | { ok: false; message: string };

type Props = {
  entityId: string | null;
  pickers: StatementClassificationPickers;
  mode: StatementBulkMode;
  classification: StatementLineClassification;
  onClassificationChange: (value: StatementLineClassification) => void;
  amountSample: number;
  targetValues: StatementClassifyTargetValues;
  learnAs: string;
  onLearnAsChange: (value: string) => void;
  correctReason: string;
  onCorrectReasonChange: (value: string) => void;
  error: string | null;
  submitting: boolean;
  progress: { done: number; total: number } | null;
  selectionCheck: SelectionCheck;
  lineCount: number;
  targetsStillRequired: boolean;
  onSubmit: (event: FormEvent) => void;
};

export function StatementBulkActionForm({
  entityId,
  pickers,
  mode,
  classification,
  onClassificationChange,
  amountSample,
  targetValues,
  learnAs,
  onLearnAsChange,
  correctReason,
  onCorrectReasonChange,
  error,
  submitting,
  progress,
  selectionCheck,
  lineCount,
  targetsStillRequired,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="bulk-classification" className="text-[11px]">
            Classification
          </Label>
          <ClassificationPicker
            id="bulk-classification"
            amountKurus={amountSample}
            value={classification}
            onValueChange={onClassificationChange}
            disabled={submitting}
            className="mt-1 h-9 w-full text-xs"
          />
        </div>
        <div className="min-w-[10rem] flex-[2]">
          <Label className="text-[11px]">Target</Label>
          <div className="mt-1">
            <StatementClassifyTargetControl
              idPrefix="bulk"
              entityId={entityId}
              pickers={pickers}
              deliveryPlatformHint={null}
              values={targetValues}
              variant="bulk"
            />
          </div>
        </div>
      </div>

      {mode === "post" && (
        <div>
          <Label htmlFor="bulk-learn-as" className="text-[11px]">
            Learn as (optional, same token for all)
          </Label>
          <Input
            id="bulk-learn-as"
            className="mt-1 h-9 text-xs"
            value={learnAs}
            onChange={(e) => onLearnAsChange(e.target.value)}
            placeholder="Short phrase for future auto-suggest…"
            disabled={submitting}
          />
        </div>
      )}

      {mode === "correct" && (
        <div>
          <Label htmlFor="bulk-correct-reason" className="text-[11px]">
            Correction reason (required)
          </Label>
          <Input
            id="bulk-correct-reason"
            className="mt-1 h-9 text-xs"
            value={correctReason}
            onChange={(e) => onCorrectReasonChange(e.target.value)}
            placeholder="Why are these lines being reclassified?"
            disabled={submitting}
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!submitting && selectionCheck.ok && targetsStillRequired && (
        <p className="text-xs text-muted-foreground">
          Choose the linked account or party before posting.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={
            submitting ||
            pickers.loading ||
            !selectionCheck.ok ||
            targetsStillRequired
          }
        >
          {submitting && progress
            ? `${mode === "post" ? "Posting" : "Correcting"} ${progress.done}/${progress.total}…`
            : mode === "post"
              ? `Post ${lineCount} lines`
              : `Correct ${lineCount} lines`}
        </Button>
      </div>
    </form>
  );
}
