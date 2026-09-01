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
  BOUNCE_NET_FEE_OPTION,
  bounceFeeCandidates,
  bounceOutflowCandidates,
  buildBounceNetFee,
  formatBounceNetFeeLabel,
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
  returnLine: BankStatementLine;
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
  returnLine,
  lines,
  pickers,
  actorId,
  onRecorded,
}: Props) {
  const submitIdempotency = useSubmitIdempotency();
  const [personType, setPersonType] = useState<BouncePersonType>("supplier");
  const [personId, setPersonId] = useState("");
  const [outflowLineId, setOutflowLineId] = useState("");
  const [netFeeChoice, setNetFeeChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const outflowCandidates = useMemo(
    () => bounceOutflowCandidates(lines, returnLine),
    [lines, returnLine],
  );

  const feeCandidates = useMemo(
    () =>
      outflowLineId
        ? bounceFeeCandidates(lines, outflowLineId, returnLine.id)
        : [],
    [lines, outflowLineId, returnLine.id],
  );

  const netFee = useMemo(() => buildBounceNetFee(feeCandidates), [feeCandidates]);

  const personOptions = useMemo(() => {
    if (personType === "supplier") {
      return pickers.suppliers.map((s) => ({ value: s.id, label: s.name }));
    }
    if (personType === "staff") {
      return pickers.employees.map((e) => ({ value: e.id, label: e.name }));
    }
    return pickers.partners.map((p) => ({ value: p.id, label: p.name }));
  }, [personType, pickers.employees, pickers.partners, pickers.suppliers]);

  const outflowOptions = useMemo(
    () =>
      outflowCandidates.map((line) => ({
        value: line.id,
        label: `${formatTry(line.amount_kurus)} · ${line.description}`,
      })),
    [outflowCandidates],
  );

  const netFeeOptions = useMemo(() => {
    if (!netFee) return [];
    return [
      { value: "", label: "Skip net fee" },
      { value: BOUNCE_NET_FEE_OPTION, label: formatBounceNetFeeLabel(netFee) },
    ];
  }, [netFee]);

  useEffect(() => {
    if (!open) return;
    setPersonType("supplier");
    setPersonId("");
    setOutflowLineId(outflowCandidates[0]?.id ?? "");
    setNetFeeChoice("");
    setError(null);
    submitIdempotency.resetSubmit();
  }, [open, returnLine.id, outflowCandidates, submitIdempotency]);

  useEffect(() => {
    setPersonId("");
  }, [personType]);

  useEffect(() => {
    if (!netFee) {
      setNetFeeChoice("");
      return;
    }
    setNetFeeChoice(BOUNCE_NET_FEE_OPTION);
  }, [netFee]);

  async function handleSubmit() {
    if (!personId || !outflowLineId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPaymentBounce(entityId, statementId, {
        outflowLineId,
        returnLineId: returnLine.id,
        personType,
        personId,
        feeLineIds:
          netFeeChoice === BOUNCE_NET_FEE_OPTION && netFee
            ? netFee.lineIds
            : null,
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
        {formatTry(returnLine.amount_kurus)} · {returnLine.description}
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
          <Label className="text-xs text-muted-foreground">Original payment (outflow)</Label>
          <Combobox
            value={outflowLineId}
            onValueChange={setOutflowLineId}
            options={outflowOptions}
            placeholder={
              outflowCandidates.length
                ? "Select matching payment…"
                : "No matching outflow on this statement"
            }
            emptyMessage="No matching outflow"
            className="mt-1 h-9 w-full text-xs"
          />
        </div>

        {netFee ? (
          <div>
            <Label className="text-xs text-muted-foreground">Bank fee (optional)</Label>
            <Combobox
              value={netFeeChoice}
              onValueChange={setNetFeeChoice}
              options={netFeeOptions}
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
            !outflowLineId ||
            pickers.loading ||
            outflowCandidates.length === 0
          }
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Recording…" : "Record bounce"}
        </Button>
      </div>
    </Dialog>
  );
}
