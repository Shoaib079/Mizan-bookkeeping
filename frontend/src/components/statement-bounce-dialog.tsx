"use client";

/** Record a payment bounced pair (outflow + return, optional fee). */

import { useEffect, useMemo, useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type {
  BankStatementLine,
  BouncePersonType,
  StatementBouncePairResult,
} from "@/lib/banking-types";
import { formatTry, parseTryToKurus } from "@/lib/money";
import {
  bounceAutoVoidTargets,
  bounceLineNeedsAutoVoid,
  bounceOutflowCandidates,
  formatBounceOutflowLabel,
  recordPaymentBounce,
} from "@/lib/statement-bounce";
import {
  formatFeeCandidateRow,
  getBounceFeeCandidates,
  resolveBounceNetFeeKurus,
  toggleFeeSelection,
} from "@/lib/statement-bounce-fee-candidates";
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
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [manualFeeAmount, setManualFeeAmount] = useState("");
  const [showFeeSelector, setShowFeeSelector] = useState(false);
  const [autoVoidConfirmed, setAutoVoidConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const outflowCandidates = useMemo(
    () => bounceOutflowCandidates(lines, returnLine),
    [lines, returnLine],
  );

  const selectedOutflow = useMemo(
    () => outflowCandidates.find((line) => line.id === outflowLineId) ?? null,
    [outflowCandidates, outflowLineId],
  );

  const feeCandidates = useMemo(
    () =>
      outflowLineId
        ? getBounceFeeCandidates(lines, outflowLineId, returnLine.id)
        : [],
    [lines, outflowLineId, returnLine.id],
  );

  const selectedFees = useMemo(
    () => feeCandidates.filter((fee) => selectedFeeIds.includes(fee.id)),
    [feeCandidates, selectedFeeIds],
  );

  const manualFeeKurus = useMemo(() => {
    if (!manualFeeAmount.trim()) return null;
    return parseTryToKurus(manualFeeAmount);
  }, [manualFeeAmount]);

  const netFeeKurus = useMemo(
    () => resolveBounceNetFeeKurus(manualFeeKurus, selectedFees),
    [manualFeeKurus, selectedFees],
  );

  const usingManualFee = manualFeeKurus !== null;
  const feeLineIds = useMemo(
    () => (usingManualFee ? [] : selectedFeeIds),
    [usingManualFee, selectedFeeIds],
  );

  const autoVoidTargets = useMemo(
    () =>
      outflowLineId
        ? bounceAutoVoidTargets(lines, outflowLineId, returnLine.id, feeLineIds)
        : [],
    [feeLineIds, lines, outflowLineId, returnLine.id],
  );

  const needsAutoVoid = autoVoidTargets.length > 0;
  const manualFeeInvalid = manualFeeAmount.trim().length > 0 && manualFeeKurus === null;

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
        label: formatBounceOutflowLabel(line),
      })),
    [outflowCandidates],
  );

  useEffect(() => {
    if (!open) return;
    setPersonType("supplier");
    setPersonId("");
    setOutflowLineId(outflowCandidates[0]?.id ?? "");
    setSelectedFeeIds([]);
    setManualFeeAmount("");
    setShowFeeSelector(false);
    setAutoVoidConfirmed(false);
    setError(null);
    submitIdempotency.resetSubmit();
  }, [open, returnLine.id, outflowCandidates, submitIdempotency]);

  useEffect(() => {
    setPersonId("");
  }, [personType]);

  useEffect(() => {
    if (!needsAutoVoid) {
      setAutoVoidConfirmed(false);
    }
  }, [needsAutoVoid]);

  useEffect(() => {
    if (feeCandidates.length === 1 && selectedFeeIds.length === 0 && !manualFeeAmount) {
      setSelectedFeeIds([feeCandidates[0]!.id]);
    }
  }, [feeCandidates, manualFeeAmount, selectedFeeIds.length]);

  function handleToggleFee(feeId: string) {
    setSelectedFeeIds((prev) => toggleFeeSelection(prev, feeId));
    if (manualFeeAmount) setManualFeeAmount("");
  }

  function handleManualFeeChange(value: string) {
    setManualFeeAmount(value);
    if (selectedFeeIds.length > 0) setSelectedFeeIds([]);
  }

  function handleClearFees() {
    setSelectedFeeIds([]);
    setManualFeeAmount("");
  }

  async function handleSubmit() {
    if (!personId || !outflowLineId || submitting || manualFeeInvalid) return;
    if (needsAutoVoid && !autoVoidConfirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPaymentBounce(entityId, statementId, {
        outflowLineId,
        returnLineId: returnLine.id,
        personType,
        personId,
        feeLineIds: usingManualFee ? null : feeLineIds.length > 0 ? feeLineIds : null,
        manualNetFeeKurus: usingManualFee ? manualFeeKurus : null,
        autoVoidConfirmed: !needsAutoVoid || autoVoidConfirmed,
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

  const showFeeSection = outflowLineId.length > 0;

  return (
    <Dialog open={open} title="Payment bounced" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Pair the original outflow with this return. Posted payments are voided
        automatically when you confirm below — no need to void first.
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

        {showFeeSection ? (
          <div className="space-y-3 rounded border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Bank fee (optional)</Label>
              {(selectedFeeIds.length > 0 || manualFeeAmount) && (
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={handleClearFees}>
                  Clear
                </Button>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Net fee (manual)</Label>
              <MoneyInput
                value={manualFeeAmount}
                onChange={handleManualFeeChange}
                placeholder="e.g. -16,76"
                className="mt-1 h-9 text-xs"
              />
            </div>

            {feeCandidates.length > 0 ? (
              <>
                <p className="text-center text-xs text-muted-foreground">or select from statement</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-full text-xs"
                  onClick={() => setShowFeeSelector((open) => !open)}
                >
                  {showFeeSelector ? "Hide fee lines" : `Show fee lines (${feeCandidates.length})`}
                </Button>
                {showFeeSelector ? (
                  <ul className="max-h-40 space-y-2 overflow-y-auto">
                    {feeCandidates.map((fee) => (
                      <li key={fee.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selectedFeeIds.includes(fee.id)}
                            onChange={() => handleToggleFee(fee.id)}
                          />
                          <span>{formatFeeCandidateRow(fee)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No unposted fee lines on this statement.</p>
            )}

            {(selectedFeeIds.length > 0 || manualFeeKurus !== null) && !manualFeeInvalid ? (
              <p className="text-sm font-medium">
                Net fee: {formatTry(netFeeKurus)}
                {usingManualFee ? " (manual)" : selectedFees.length > 1 ? ` (${selectedFees.length} lines)` : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {needsAutoVoid ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              {autoVoidTargets.length === 1 && selectedOutflow && bounceLineNeedsAutoVoid(selectedOutflow)
                ? "This payment was already posted. It will be voided when you record the bounce."
                : "Some selected lines have ledger entries. They will be voided when you record the bounce."}
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoVoidConfirmed}
                onChange={(event) => setAutoVoidConfirmed(event.target.checked)}
              />
              Auto-void and proceed
            </label>
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
            outflowCandidates.length === 0 ||
            manualFeeInvalid ||
            (needsAutoVoid && !autoVoidConfirmed)
          }
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Recording…" : "Record bounce"}
        </Button>
      </div>
    </Dialog>
  );
}
