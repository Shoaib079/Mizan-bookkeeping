"use client";

/** Correct dialog for StatementLineReviewRow. */

import { FormEvent } from "react";

import { ClassificationPicker } from "@/components/banking/classification-picker";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import type { StatementLineClassification } from "@/lib/banking-types";

type Named = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  lineId: string;
  amountKurus: number;
  correctReason: string;
  onCorrectReasonChange: (value: string) => void;
  correctClassification: StatementLineClassification;
  onCorrectClassificationChange: (value: StatementLineClassification) => void;
  suppliers: Named[];
  supplierId: string;
  onSupplierIdChange: (id: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
};

export function StatementLineReviewCorrectDialog({
  open,
  onClose,
  lineId,
  amountKurus,
  correctReason,
  onCorrectReasonChange,
  correctClassification,
  onCorrectClassificationChange,
  suppliers,
  supplierId,
  onSupplierIdChange,
  submitting,
  error,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} title="Correct statement line" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Voids the linked journal entry through the ledger void path, downgrades
          the learned rule, and posts the corrected classification.
        </p>
        <div>
          <Label htmlFor={`reason-${lineId}`}>Reason (required)</Label>
          <Input
            id={`reason-${lineId}`}
            value={correctReason}
            onChange={(event) => onCorrectReasonChange(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor={`correct-cls-${lineId}`}>New classification</Label>
          <ClassificationPicker
            id={`correct-cls-${lineId}`}
            amountKurus={amountKurus}
            value={correctClassification}
            onValueChange={onCorrectClassificationChange}
            showHint
          />
        </div>
        {correctClassification === "supplier_payment" && (
          <div>
            <Label htmlFor={`correct-sup-${lineId}`}>Supplier</Label>
            <Combobox
              id={`correct-sup-${lineId}`}
              value={supplierId}
              onValueChange={onSupplierIdChange}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
              placeholder="Supplier…"
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !correctReason.trim()}>
            {submitting ? "Correcting…" : "Correct & re-post"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
