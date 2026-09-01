"use client";

/** Record a payment bounced pair (outflow + return, optional fee). */

import { useEffect, useMemo, useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import type {
  BankStatementLine,
  BouncePersonType,
  StatementBouncePairResult,
} from "@/lib/banking-types";
import { formatTry } from "@/lib/money";
import {
  bounceFeeCandidates,
  bounceReturnCandidates,
  recordPaymentBounce,
} from "@/lib/statement-bounce";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";

const PERSON_TYPES: { value: BouncePersonType; label: string }[] = [
  { value: "supplier", label: "Supplier" },
  { value: "staff", label: "Staff" },
  { value: "partner", label: "Partner" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  entityId: string;
  statementId: string;
  outflowLine: BankStatementLine;
  lines: BankStatementLine[];
  pickers: StatementClassificationPickers;
  actorId: string | null;
  onRecorded: (result: StatementBouncePairResult) => void;
};

export function StatementBounceDialog({
  open,
  onClose,
  entityId,
  statementId,
  outflowLine,
  lines,
  pickers,
  actorId,
  onRecorded,
}: Props) {
  const submitIdempotency = useSubmitIdempotency();
  const [personType, setPersonType] = useState<BouncePersonType>("supplier");
  const [personId, setPersonId] = useState("");
  const [returnLineId, setReturnLineId] = useState("");
  const [feeLineId, setFeeLineId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const returnCandidates = useMemo(
    () => bounceReturnCandidates(lines, outflowLine),
    [lines, outflowLine],
  );

  const feeCandidates = useMemo(
    () =>
      returnLineId
        ? bounceFeeCandidates(lines, outflowLine, returnLineId)
        : [],
    [lines, outflowLine, returnLineId],
  );

  const personOptions = useMemo(() => {
    if (personType === "supplier") {
      return pickers.suppliers.map((s) => ({ value: s.id, label: s.name }));
    }
    if (personType === "staff") {
      return pickers.employees.map((e) => ({ value: e.id, label: e.name }));
    }
    return pickers.partners.map((p) => ({ value: p.id, label: p.name }));
  }, [personType, pickers.employees, pickers.partners, pickers.suppliers]);

  const returnOptions = useMemo(
    () =>
      returnCandidates.map((line) => ({
        value: line.id,
        label: `${formatTry(line.amount_kurus)} · ${line.description}`,
      })),
    [returnCandidates],
  );

  const feeOptions = useMemo(
    () => [
      { value: "", label: "No fee line" },
      ...feeCandidates.map((line) => ({
        value: line.id,
        label: `${formatTry(line.amount_kurus)} · ${line.description}`,
      })),
    ],
    [feeCandidates],
  );

  useEffect(() => {
    if (!open) return;
    setPersonType("supplier");
    setPersonId("");
    setReturnLineId(returnCandidates[0]?.id ?? "");
    setFeeLineId("");
    setError(null);
    submitIdempotency.resetSubmit();
  }, [open, outflowLine.id, returnCandidates, submitIdempotency]);

  useEffect(() => {
    setPersonId("");
  }, [personType]);

  async function handleSubmit() {
    if (!personId || !returnLineId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPaymentBounce(entityId, statementId, {
        outflowLineId: outflowLine.id,
        returnLineId,
        personType,
        personId,
        feeLineId: feeLineId || null,
        actorId,
        idempotencyKey: submitIdempotency.beginSubmit(),
      });
      submitIdempotency.completeSubmit();
      onRecorded(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bounce failed");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Payment bounced" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Void the payment first if it was already posted. The return is not income
        — this pairs the outflow and return without posting the payment again.
      </p>
      <p className="mt-2 text-sm font-medium">
        {formatTry(outflowLine.amount_kurus)} · {outflowLine.description}
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Person type</Label>
          <Combobox
            value={personType}
            onValueChange={(value) => setPersonType(value as BouncePersonType)}
            options={PERSON_TYPES}
            className="mt-1 h-9 w-full text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Person</Label>
          <Combobox
            value={personId}
            onValueChange={setPersonId}
            options={personOptions}
            placeholder="Select…"
            className="mt-1 h-9 w-full text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Return inflow</Label>
          <Combobox
            value={returnLineId}
            onValueChange={setReturnLineId}
            options={returnOptions}
            placeholder={
              returnCandidates.length
                ? "Select matching return…"
                : "No matching inflow on this statement"
            }
            emptyMessage="No matching inflow"
            className="mt-1 h-9 w-full text-xs"
          />
        </div>

        {feeCandidates.length > 0 ? (
          <div>
            <Label className="text-xs text-muted-foreground">
              Bank fee (optional)
            </Label>
            <Combobox
              value={feeLineId}
              onValueChange={setFeeLineId}
              options={feeOptions}
              className="mt-1 h-9 w-full text-xs"
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={
            submitting ||
            !personId ||
            !returnLineId ||
            pickers.loading ||
            returnCandidates.length === 0
          }
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Recording…" : "Record bounce"}
        </Button>
      </div>
    </Dialog>
  );
}
