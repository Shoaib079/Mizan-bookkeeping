"use client";

/** Correct-line dialog for StatementClassifyBar. */

import { FormEvent } from "react";

import { ClassificationPicker } from "@/components/banking/classification-picker";
import {
  StatementClassifyTargetControl,
  type StatementClassifyTargetValues,
} from "@/components/statement-classify-target-control";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import type { StatementLineClassification } from "@/lib/banking-types";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

type Props = {
  open: boolean;
  onClose: () => void;
  amountKurus: number;
  classification: StatementLineClassification;
  onClassificationChange: (value: StatementLineClassification) => void;
  correctReason: string;
  onCorrectReasonChange: (value: string) => void;
  submitting: boolean;
  entityId: string | null;
  pickers: StatementClassificationPickers;
  deliveryPlatformHint: string | null;
  targetValues: StatementClassifyTargetValues;
  onSubmit: (event: FormEvent) => void;
};

export function StatementClassifyCorrectDialog({
  open,
  onClose,
  amountKurus,
  classification,
  onClassificationChange,
  correctReason,
  onCorrectReasonChange,
  submitting,
  entityId,
  pickers,
  deliveryPlatformHint,
  targetValues,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} title="Correct line">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Voids the existing ledger entry (if any), learns from your correction,
          and re-posts with the new classification.
        </p>
        <div>
          <Label htmlFor="correct-reason">Reason</Label>
          <Input
            id="correct-reason"
            className="mt-1"
            value={correctReason}
            onChange={(e) => onCorrectReasonChange(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="correct-classification">New classification</Label>
          <div className="mt-1">
            <ClassificationPicker
              id="correct-classification"
              amountKurus={amountKurus}
              value={classification}
              onValueChange={onClassificationChange}
              showHint
            />
          </div>
        </div>
        <StatementClassifyTargetControl
          idPrefix="correct"
          entityId={entityId}
          pickers={pickers}
          deliveryPlatformHint={deliveryPlatformHint}
          values={targetValues}
        />
        {classification === "staff_payment" && (
          <p className="text-xs text-muted-foreground">
            Salary month and amount are chosen on the next step — same as when
            posting from the queue.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Correcting…"
              : classification === "staff_payment"
                ? "Next: salary period…"
                : "Correct & re-post"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
