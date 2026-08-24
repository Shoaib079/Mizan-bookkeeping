"use client";

/** State + post/correct for StatementClassifyBar (file-size split). */

import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  BankStatementLine,
  ClassifyStatementLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  classificationMatchesAmount,
  classificationOption,
  deliveryPlatformPickerHint,
} from "@/lib/statement-classification-options";
import {
  buildClassifyLinePayload,
  targetsRequiredForClassification,
} from "@/lib/statement-classify-payload";
import {
  isCorrectableLine,
  isQueueLine,
} from "@/lib/statement-line-filters";
import {
  hydrateStatementLineFormState,
  postedLineTargetSummary,
  type StatementLineFormTargets,
} from "@/lib/statement-line-form-state";
import {
  classifyStatementLine,
  correctStatementLine,
} from "@/lib/statement-review-actions";
import { useHydrateOnce } from "@/lib/use-hydrate-once";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
import { useToast } from "@/lib/toast";

export type UseStatementClassifyBarArgs = {
  statementId: string;
  line: BankStatementLine | null;
  pickers: StatementClassificationPickers;
  onPosted: (result: ClassifyStatementLineResult) => void;
};

export function useStatementClassifyBar({
  statementId,
  line,
  pickers,
  onPosted,
}: UseStatementClassifyBarArgs) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [classification, setClassification] =
    useState<StatementLineClassification>("supplier_payment");
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [capitalNote, setCapitalNote] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [deliveryPlatformId, setDeliveryPlatformId] = useState("");
  const [learnAs, setLearnAs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctReason, setCorrectReason] = useState("");
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [salaryDialogPurpose, setSalaryDialogPurpose] = useState<
    "post" | "correct" | null
  >(null);

  const selectedEmployee = useMemo(
    () => pickers.employees.find((e) => e.id === employeeId) ?? null,
    [employeeId, pickers.employees],
  );
  const inQueue = line != null && isQueueLine(line);
  const correctable = line != null && isCorrectableLine(line) && !inQueue;
  const postedTargetSummary =
    line != null && correctable
      ? postedLineTargetSummary(line, pickers)
      : null;

  const formTargets = useMemo<StatementLineFormTargets>(
    () => ({
      classification,
      supplierId,
      customerId,
      employeeId,
      partnerId,
      note: capitalNote,
      counterpartId,
      creditCardId,
      expenseAccountId,
      incomeAccountId,
      deliveryPlatformId,
    }),
    [
      classification,
      supplierId,
      customerId,
      employeeId,
      partnerId,
      capitalNote,
      counterpartId,
      creditCardId,
      expenseAccountId,
      incomeAccountId,
      deliveryPlatformId,
    ],
  );

  function applyFormTargets(targets: StatementLineFormTargets) {
    setClassification(targets.classification);
    setSupplierId(targets.supplierId);
    setCustomerId(targets.customerId);
    setEmployeeId(targets.employeeId);
    setPartnerId(targets.partnerId);
    setCapitalNote(targets.note);
    setCounterpartId(targets.counterpartId);
    setCreditCardId(targets.creditCardId);
    setExpenseAccountId(targets.expenseAccountId);
    setIncomeAccountId(targets.incomeAccountId);
    setDeliveryPlatformId(targets.deliveryPlatformId);
  }

  function openCorrectDialog() {
    if (!line) return;
    applyFormTargets(hydrateStatementLineFormState(line, pickers, "correct"));
    setCorrectOpen(true);
  }

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line?.id, submitIdempotency]);

  useHydrateOnce(line?.id ?? null, !pickers.loading, () => {
    if (!line) return;
    setLearnAs(line.description);
    setError(null);
    setCorrectOpen(false);
    setCorrectReason("");
    if (isQueueLine(line)) {
      applyFormTargets(hydrateStatementLineFormState(line, pickers, "post"));
    }
  });

  const deliveryPlatformHint =
    line != null && classification === "delivery_settlement"
      ? deliveryPlatformPickerHint(line.description, pickers.deliveryPlatforms)
      : null;

  const selectedOption = classificationOption(classification);
  const amountMismatch =
    line != null &&
    !classificationMatchesAmount(classification, line.amount_kurus);

  function buildPayload(target: StatementLineClassification) {
    return buildClassifyLinePayload(line!, {
      actorId,
      classification: target,
      targets: { ...formTargets, classification: target },
      learnAs,
    });
  }

  async function executePost(extra?: Record<string, unknown>) {
    if (!entityId || !line || !inQueue) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const result = await classifyStatementLine(
        entityId,
        statementId,
        line.id,
        { ...buildPayload(classification), ...extra } as Parameters<
          typeof classifyStatementLine
        >[3],
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      if (result.routed_to_needs_review) {
        toast("Sent to needs review — confirm the match below");
      } else if (result.journal_entry_id) {
        toast("Posted to ledger");
      } else if (classification === "unknown") {
        toast("Saved without ledger post — use Skipped filter to find it");
      } else {
        toast("Line classified");
      }
      setSalaryDialogOpen(false);
      onPosted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePost(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !line || !inQueue) return;
    if (amountMismatch) {
      setError(
        "This classification does not match the line direction (inflow vs outflow).",
      );
      return;
    }
    if (classification === "staff_payment") {
      if (!employeeId) {
        setError("Choose an employee.");
        return;
      }
      setSalaryDialogPurpose("post");
      setSalaryDialogOpen(true);
      return;
    }
    await executePost();
  }

  async function executeCorrect(extra?: Record<string, unknown>) {
    if (!entityId || !line || !correctReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const result = await correctStatementLine(
        entityId,
        statementId,
        line.id,
        {
          ...(buildPayload(classification) as Parameters<
            typeof correctStatementLine
          >[3]),
          reason: correctReason.trim(),
          ...extra,
        },
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      toast("Line corrected and re-posted");
      setCorrectOpen(false);
      setSalaryDialogOpen(false);
      setSalaryDialogPurpose(null);
      onPosted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCorrect(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !line || !correctReason.trim()) {
      setError("Correction reason is required.");
      return;
    }
    if (amountMismatch) {
      setError(
        "This classification does not match the line direction (inflow vs outflow).",
      );
      return;
    }
    if (targetsRequiredForClassification(classification, formTargets)) {
      setError(
        "Choose the linked account, supplier, or other target before correcting.",
      );
      return;
    }
    if (classification === "staff_payment") {
      if (!employeeId) {
        setError("Choose an employee.");
        return;
      }
      setSalaryDialogPurpose("correct");
      setSalaryDialogOpen(true);
      return;
    }
    await executeCorrect();
  }

  const targetValues = {
    classification,
    supplierId,
    setSupplierId,
    customerId,
    setCustomerId,
    employeeId,
    setEmployeeId,
    partnerId,
    setPartnerId,
    capitalNote,
    setCapitalNote,
    counterpartId,
    setCounterpartId,
    creditCardId,
    setCreditCardId,
    expenseAccountId,
    setExpenseAccountId,
    incomeAccountId,
    setIncomeAccountId,
    deliveryPlatformId,
    setDeliveryPlatformId,
  };

  async function onSalaryConfirm(payload: {
    amount_minor: number;
    period_year: number;
    period_month: number;
    period_salary_minor: number;
  }) {
    if (!line) return;
    if (payload.amount_minor !== Math.abs(line.amount_kurus)) {
      setError("Bank line amount must match the payment.");
      return;
    }
    const periodFields = {
      period_year: payload.period_year,
      period_month: payload.period_month,
      period_salary_minor: payload.period_salary_minor,
    };
    if (salaryDialogPurpose === "correct") {
      await executeCorrect(periodFields);
      return;
    }
    await executePost(periodFields);
  }

  return {
    entityId,
    classification,
    setClassification,
    learnAs,
    setLearnAs,
    error,
    submitting,
    correctOpen,
    setCorrectOpen,
    correctReason,
    setCorrectReason,
    salaryDialogOpen,
    setSalaryDialogOpen,
    setSalaryDialogPurpose,
    selectedEmployee,
    inQueue,
    correctable,
    postedTargetSummary,
    deliveryPlatformHint,
    selectedOption,
    amountMismatch,
    targetValues,
    openCorrectDialog,
    handlePost,
    handleCorrect,
    onSalaryConfirm,
    executeCorrect,
  };
}
