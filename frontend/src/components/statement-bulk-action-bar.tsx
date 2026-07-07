"use client";

/** Bulk post / correct bar for multiple selected bank statement lines. */

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import type {
  BankStatementLine,
  ClassifyStatementLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { expenseAccountComboboxOptions } from "@/lib/expense-accounts";
import { formatTry } from "@/lib/money";
import {
  classificationOptionGroups,
  classificationOptionsForAmount,
} from "@/lib/statement-classification-options";
import { targetsRequiredForClassification } from "@/lib/statement-classify-payload";
import {
  amountDirectionForLines,
  bulkModeForLines,
  validateBulkSelection,
} from "@/lib/statement-bulk-selection";
import { runStatementBulkAction } from "@/lib/statement-bulk-runner";
import type { StatementLineFormTargets } from "@/lib/statement-line-form-state";
import {
  deliveryPlatformComboboxOptions,
  type StatementClassificationPickers,
} from "@/lib/use-statement-classification-pickers";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Props = {
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
  counterpartId: "",
  creditCardId: "",
  expenseAccountId: "",
  deliveryPlatformId: "",
};

export function StatementBulkActionBar({
  lines,
  pickers,
  onLineDone,
  onComplete,
  onClearSelection,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const mode = bulkModeForLines(lines);
  const direction = amountDirectionForLines(lines);
  const optionGroups = useMemo(() => classificationOptionGroups(), []);

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

  function renderTargetControl() {
    switch (classification) {
      case "supplier_payment":
        return (
          <Combobox
            value={targets.supplierId}
            onValueChange={(supplierId) => patchTargets({ supplierId })}
            options={pickers.suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Supplier…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "customer_payment":
        return (
          <Combobox
            value={targets.customerId}
            onValueChange={(customerId) => patchTargets({ customerId })}
            options={pickers.customers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Customer…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "staff_advance":
      case "staff_incentive":
        return (
          <Combobox
            value={targets.employeeId}
            onValueChange={(employeeId) => patchTargets({ employeeId })}
            options={pickers.employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="Employee…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "partner_drawing":
      case "partner_reimbursement":
      case "partner_drawing_repayment":
      case "partner_capital_contribution":
      case "partner_loan_receipt":
      case "partner_loan_payment":
        return (
          <Combobox
            value={targets.partnerId}
            onValueChange={(partnerId) => patchTargets({ partnerId })}
            options={pickers.partners.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Partner…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "transfer":
        return (
          <Combobox
            value={targets.counterpartId}
            onValueChange={(counterpartId) => patchTargets({ counterpartId })}
            options={pickers.moneyAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Other account…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "credit_card_payment":
        return (
          <Combobox
            value={targets.creditCardId}
            onValueChange={(creditCardId) => patchTargets({ creditCardId })}
            options={pickers.creditCards.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Credit card…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      case "rent_utility":
      case "store_purchase":
        return (
          <div className="flex min-w-0 flex-1 items-end gap-1">
            <div className="min-w-0 flex-1">
              <Combobox
                value={targets.expenseAccountId}
                onValueChange={(expenseAccountId) =>
                  patchTargets({ expenseAccountId })
                }
                options={expenseAccountComboboxOptions(pickers.expenseAccounts)}
                placeholder="Expense GL…"
                className="h-9 w-full min-w-0 text-xs"
              />
            </div>
            {entityId && (
              <AddExpenseCategoryButton
                entityId={entityId}
                className="shrink-0 px-2 text-xs"
                onCreated={async (account) => {
                  pickers.appendExpenseAccount(account);
                  patchTargets({ expenseAccountId: account.id });
                }}
              />
            )}
          </div>
        );
      case "delivery_settlement":
        return (
          <Combobox
            value={targets.deliveryPlatformId}
            onValueChange={(deliveryPlatformId) =>
              patchTargets({ deliveryPlatformId })
            }
            options={deliveryPlatformComboboxOptions(pickers.deliveryPlatforms)}
            placeholder="Delivery platform…"
            className="h-9 w-full min-w-0 text-xs"
          />
        );
      default:
        return null;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !actorId || !mode || submitting) return;

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

  if (!mode || lines.length === 0) return null;

  const amountClass =
    totalKurus > 0 ? "text-success" : totalKurus < 0 ? "text-destructive" : "";

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Bulk {mode === "post" ? "post" : "correct"} · {lines.length} selected
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs"
          disabled={submitting}
          onClick={onClearSelection}
        >
          Clear selection
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Same classification and targets apply to every selected line.
        {direction === "inflow" ? " Inflows only." : null}
        {direction === "outflow" ? " Outflows only." : null}
        {" "}
        <span className={cn("font-medium tabular-nums", amountClass)}>
          Net {formatTry(totalKurus)}
        </span>
      </p>

      {!selectionCheck.ok && (
        <p className="text-xs text-destructive">{selectionCheck.message}</p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="bulk-classification" className="text-[11px]">
              Classification
            </Label>
            <Select
              id="bulk-classification"
              className="mt-1 h-9 w-full text-xs"
              value={classification}
              onChange={(e) =>
                setClassification(e.target.value as StatementLineClassification)
              }
              disabled={submitting}
            >
              {optionGroups.inflows
                .filter((opt) =>
                  classificationOptions.some((o) => o.value === opt.value),
                )
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              {optionGroups.outflows
                .filter((opt) =>
                  classificationOptions.some((o) => o.value === opt.value),
                )
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              {optionGroups.other
                .filter((opt) =>
                  classificationOptions.some((o) => o.value === opt.value),
                )
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
            </Select>
          </div>
          <div className="min-w-[10rem] flex-[2]">
            <Label className="text-[11px]">Target</Label>
            <div className="mt-1">{renderTargetControl()}</div>
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
              onChange={(e) => setLearnAs(e.target.value)}
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
              onChange={(e) => setCorrectReason(e.target.value)}
              placeholder="Why are these lines being reclassified?"
              disabled={submitting}
            />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={
              submitting ||
              pickers.loading ||
              !selectionCheck.ok ||
              targetsRequiredForClassification(classification, targets)
            }
          >
            {submitting && progress
              ? `${mode === "post" ? "Posting" : "Correcting"} ${progress.done}/${progress.total}…`
              : mode === "post"
                ? `Post ${lines.length} lines`
                : `Correct ${lines.length} lines`}
          </Button>
        </div>
      </form>
    </div>
  );
}
