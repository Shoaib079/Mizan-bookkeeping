"use client";

/** State and submit for StatementBulkActionBar. */

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { StatementClassifyTargetValues } from "@/components/statement-classify-target-control";
import type {
  BankStatementLine,
  ClassifyStatementLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { classificationOptionsForAmount } from "@/lib/statement-classification-options";
import { targetsRequiredForClassification } from "@/lib/statement-classify-payload";
import {
  amountDirectionForLines,
  bulkModeForLines,
  validateBulkSelection,
} from "@/lib/statement-bulk-selection";
import { runStatementBulkAction } from "@/lib/statement-bulk-runner";
import type { StatementLineFormTargets } from "@/lib/statement-line-form-state";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { useToast } from "@/lib/toast";

export type StatementBulkActionBarProps = {
  lines: BankStatementLine[];
  pickers: StatementClassificationPickers;
  onLineDone: (result: ClassifyStatementLineResult) => void;
  onComplete: () => void;
  onClearSelection: () => void;
};

const EMPTY_TARGETS: StatementLineFormTargets = {
  classification: "supplier_payment",
  supplierId: "",
  customerId: "",
  employeeId: "",
  partnerId: "",
  note: "",
  counterpartId: "",
  creditCardId: "",
  expenseAccountId: "",
  incomeAccountId: "",
  deliveryPlatformId: "",
};

export function useStatementBulkActionBar({
  lines,
  pickers,
  onLineDone,
  onComplete,
  onClearSelection,
}: StatementBulkActionBarProps) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const mode = bulkModeForLines(lines);
  const direction = amountDirectionForLines(lines);

  const [classification, setClassification] = useState<StatementLineClassification>(
    "bank_fee",
  );
  const [targets, setTargets] = useState<StatementLineFormTargets>(EMPTY_TARGETS);
  const [learnAs, setLearnAs] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const amountSample = lines[0]?.amount_kurus ?? 0;
  const classificationOptions = useMemo(
    () => classificationOptionsForAmount(amountSample),
    [amountSample],
  );

  useEffect(() => {
    if (classificationOptions.some((opt) => opt.value === classification)) return;
    const fallback = classificationOptions[0]?.value ?? "unknown";
    setClassification(fallback);
  }, [classification, classificationOptions]);

  useEffect(() => {
    setTargets((prev) => ({ ...prev, classification }));
  }, [classification]);

  const selectionCheck = validateBulkSelection(lines, classification);
  const totalKurus = lines.reduce((sum, line) => sum + line.amount_kurus, 0);

  function patchTargets(patch: Partial<StatementLineFormTargets>) {
    setTargets((prev) => ({ ...prev, ...patch }));
  }

  const targetValues: StatementClassifyTargetValues = {
    classification,
    supplierId: targets.supplierId,
    setSupplierId: (supplierId) => patchTargets({ supplierId }),
    customerId: targets.customerId,
    setCustomerId: (customerId) => patchTargets({ customerId }),
    employeeId: targets.employeeId,
    setEmployeeId: (employeeId) => patchTargets({ employeeId }),
    partnerId: targets.partnerId,
    setPartnerId: (partnerId) => patchTargets({ partnerId }),
    capitalNote: targets.note,
    setCapitalNote: (note) => patchTargets({ note }),
    counterpartId: targets.counterpartId,
    setCounterpartId: (counterpartId) => patchTargets({ counterpartId }),
    creditCardId: targets.creditCardId,
    setCreditCardId: (creditCardId) => patchTargets({ creditCardId }),
    expenseAccountId: targets.expenseAccountId,
    setExpenseAccountId: (expenseAccountId) => patchTargets({ expenseAccountId }),
    incomeAccountId: targets.incomeAccountId,
    setIncomeAccountId: (incomeAccountId) => patchTargets({ incomeAccountId }),
    deliveryPlatformId: targets.deliveryPlatformId,
    setDeliveryPlatformId: (deliveryPlatformId) =>
      patchTargets({ deliveryPlatformId }),
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !mode || submitting) {
      if (!entityId) setError("Select a restaurant in the sidebar first.");
      return;
    }

    const validation = validateBulkSelection(lines, classification);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (targetsRequiredForClassification(classification, targets)) {
      setError("Choose the linked account, supplier, or other target first.");
      return;
    }
    if (mode === "correct" && !correctReason.trim()) {
      setError("Correction reason is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgress({ done: 0, total: lines.length });

    try {
      const result = await runStatementBulkAction({
        entityId,
        lines,
        mode,
        actorId,
        classification,
        targets,
        learnAs,
        correctReason,
        onLineDone,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      if (result.failed.length === 0) {
        toast(
          mode === "post"
            ? `Posted ${result.succeeded.length} lines`
            : `Corrected ${result.succeeded.length} lines`,
        );
        onClearSelection();
        onComplete();
      } else if (result.succeeded.length > 0) {
        toast(
          `${result.succeeded.length} done, ${result.failed.length} failed — fix the rest individually`,
        );
        setError(result.failed[0]?.error ?? "Some lines failed");
        onComplete();
      } else {
        setError(result.failed[0]?.error ?? "Bulk action failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const amountClass =
    totalKurus > 0 ? "text-success" : totalKurus < 0 ? "text-destructive" : "";

  const targetsStillRequired = targetsRequiredForClassification(
    classification,
    targets,
  );

  return {
    entityId,
    pickers,
    mode,
    direction,
    classification,
    setClassification,
    targetValues,
    learnAs,
    setLearnAs,
    correctReason,
    setCorrectReason,
    error,
    submitting,
    progress,
    amountSample,
    selectionCheck,
    totalKurus,
    amountClass,
    targetsStillRequired,
    handleSubmit,
    lines,
    onClearSelection,
  };
}
