"use client";

/** One-line-at-a-time bank statement classification bar (search-bar style). */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  BankStatementLine,
  ClassifyStatementLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  classificationLabel,
  classificationMatchesAmount,
  classificationOption,
  classificationOptionGroups,
  deliveryPlatformPickerHint,
} from "@/lib/statement-classification-options";
import {
  deliveryPlatformComboboxOptions,
  type StatementClassificationPickers,
} from "@/lib/use-statement-classification-pickers";
import {
  classifyStatementLine,
  correctStatementLine,
} from "@/lib/statement-review-actions";
import {
  isCorrectableLine,
  isQueueLine,
} from "@/lib/statement-line-filters";
import {
  hydrateStatementLineFormState,
  postedLineTargetSummary,
  type StatementLineFormTargets,
} from "@/lib/statement-line-form-state";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Props = {
  statementId: string;
  line: BankStatementLine | null;
  queueIndex: number;
  queueTotal: number;
  pickers: StatementClassificationPickers;
  onPosted: (result: ClassifyStatementLineResult) => void;
};

export function StatementClassifyBar({
  statementId,
  line,
  queueIndex,
  queueTotal,
  pickers,
  onPosted,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const optionGroups = useMemo(() => classificationOptionGroups(), []);

  const [classification, setClassification] = useState<StatementLineClassification>(
    "supplier_payment",
  );
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
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

  function applyFormTargets(targets: StatementLineFormTargets) {
    setClassification(targets.classification);
    setSupplierId(targets.supplierId);
    setCustomerId(targets.customerId);
    setEmployeeId(targets.employeeId);
    setPartnerId(targets.partnerId);
    setCounterpartId(targets.counterpartId);
    setCreditCardId(targets.creditCardId);
    setExpenseAccountId(targets.expenseAccountId);
    setDeliveryPlatformId(targets.deliveryPlatformId);
  }

  function openCorrectDialog() {
    if (!line) return;
    applyFormTargets(hydrateStatementLineFormState(line, pickers, "correct"));
    setCorrectOpen(true);
  }

  function targetRequiredForClassification(
    target: StatementLineClassification,
  ): boolean {
    const kind = classificationOption(target)?.target;
    if (kind === "supplier" && !supplierId) return true;
    if (kind === "customer" && !customerId) return true;
    if (kind === "employee" && !employeeId) return true;
    if (kind === "partner" && !partnerId) return true;
    if (kind === "transfer" && !counterpartId) return true;
    if (kind === "credit_card" && !creditCardId) return true;
    if (kind === "expense" && !expenseAccountId) return true;
    if (kind === "delivery_platform" && !deliveryPlatformId) return true;
    return false;
  }

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line?.id, submitIdempotency]);

  useEffect(() => {
    if (!line) return;
    setLearnAs(line.description);
    setError(null);
    setCorrectOpen(false);
    setCorrectReason("");

    if (isQueueLine(line)) {
      applyFormTargets(hydrateStatementLineFormState(line, pickers, "post"));
    }
  }, [line, pickers]);

  const deliveryPlatformHint =
    line != null && classification === "delivery_settlement"
      ? deliveryPlatformPickerHint(line.description, pickers.deliveryPlatforms)
      : null;

  const selectedOption = classificationOption(classification);
  const amountMismatch =
    line != null && !classificationMatchesAmount(classification, line.amount_kurus);

  function learnMatchToken(): string | undefined {
    const trimmed = learnAs.trim();
    if (!trimmed || !line || trimmed === line.description.trim()) return undefined;
    return trimmed;
  }

  function buildPayload(
    target: StatementLineClassification,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      classification: target,
      actor_id: actorId,
    };
    const token = learnMatchToken();
    if (token) body.match_token = token;
    if (target === "supplier_payment") body.supplier_id = supplierId;
    if (target === "transfer") body.counterpart_money_account_id = counterpartId;
    if (target === "credit_card_payment")
      body.credit_card_money_account_id = creditCardId;
    if (target === "customer_payment") body.customer_id = customerId;
    if (target === "rent_utility" || target === "store_purchase")
      body.expense_account_id = expenseAccountId;
    if (target === "delivery_settlement")
      body.delivery_platform_id = deliveryPlatformId;
    if (target === "staff_payment" || target === "staff_advance" || target === "staff_incentive")
      body.employee_id = employeeId;
    if (
      target === "partner_drawing" ||
      target === "partner_reimbursement" ||
      target === "partner_drawing_repayment"
    ) {
      body.partner_id = partnerId;
    }
    if (line?.candidate_supplier_ledger_entry_id) {
      body.confirm_supplier_ledger_entry_id =
        line.candidate_supplier_ledger_entry_id;
    }
    if (line?.candidate_account_transfer_id) {
      body.confirm_account_transfer_id = line.candidate_account_transfer_id;
    }
    return body;
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
    if (targetRequiredForClassification(classification)) {
      setError("Choose the linked account, supplier, or other target before correcting.");
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

  const targetKind = classificationOption(classification)?.target;

  function targetControl(idPrefix = "classify") {
    if (targetKind === "supplier") {
      return (
        <Combobox
          id={`${idPrefix}-supplier`}
          value={supplierId}
          onValueChange={setSupplierId}
          options={pickers.suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Supplier…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "customer") {
      return (
        <Combobox
          id={`${idPrefix}-customer`}
          value={customerId}
          onValueChange={setCustomerId}
          options={pickers.customers.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Customer…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "employee") {
      return (
        <Combobox
          id={`${idPrefix}-employee`}
          value={employeeId}
          onValueChange={setEmployeeId}
          options={pickers.employees.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Employee…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "partner") {
      return (
        <Combobox
          id={`${idPrefix}-partner`}
          value={partnerId}
          onValueChange={setPartnerId}
          options={pickers.partners.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Partner…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "transfer") {
      return (
        <Combobox
          id={`${idPrefix}-transfer`}
          value={counterpartId}
          onValueChange={setCounterpartId}
          options={pickers.moneyAccounts.map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          placeholder="Account…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "credit_card") {
      return (
        <Combobox
          id={`${idPrefix}-card`}
          value={creditCardId}
          onValueChange={setCreditCardId}
          options={pickers.creditCards.map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          placeholder="Card…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "expense") {
      return (
        <div className="flex min-w-0 flex-1 items-end gap-1">
          <div className="min-w-0 flex-1">
            <Combobox
              id={`${idPrefix}-expense`}
              value={expenseAccountId}
              onValueChange={setExpenseAccountId}
              options={pickers.expenseAccounts.map((a) => ({
                value: a.id,
                label: `${a.code} — ${a.name_en}`,
              }))}
              placeholder="Expense GL — rent, utilities, repairs…"
              className="h-9 w-full min-w-0 text-xs"
            />
          </div>
          {entityId && (
            <AddExpenseCategoryButton
              entityId={entityId}
              className="shrink-0 px-2 text-xs"
              onCreated={async (account) => {
                pickers.appendExpenseAccount(account);
                setExpenseAccountId(account.id);
              }}
            />
          )}
        </div>
      );
    }
    if (targetKind === "delivery_platform") {
      return (
        <div className="space-y-1">
          <Combobox
            id={`${idPrefix}-platform`}
            value={deliveryPlatformId}
            onValueChange={setDeliveryPlatformId}
            options={deliveryPlatformComboboxOptions(pickers.deliveryPlatforms)}
            placeholder="Platform…"
            emptyMessage={
              pickers.deliveryPlatformsError
                ? "Could not load platforms"
                : "No delivery platforms — add under Delivery → Platforms"
            }
            className="h-9 w-full min-w-0 text-xs"
          />
          {pickers.deliveryPlatformsError && (
            <p className="text-[11px] text-destructive">
              {pickers.deliveryPlatformsError}
            </p>
          )}
          {deliveryPlatformHint && (
            <p className="text-[11px] text-warning">{deliveryPlatformHint}</p>
          )}
        </div>
      );
    }
    return null;
  }

  function renderClassificationSelect(id: string, disabled: boolean) {
    const renderGroup = (
      label: string,
      items: { value: string; label: string }[],
    ) =>
      items.length > 0 ? (
        <optgroup key={label} label={label}>
          {items.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ) : null;

    return (
      <Select
        id={id}
        className="h-9 w-full min-w-0 text-xs"
        value={classification}
        onChange={(e) =>
          setClassification(e.target.value as StatementLineClassification)
        }
        disabled={disabled}
      >
        {renderGroup("Money in (credit to bank)", optionGroups.inflows)}
        {renderGroup("Money out (debit from bank)", optionGroups.outflows)}
        {renderGroup("Other", optionGroups.other)}
      </Select>
    );
  }

  if (!line) {
    return (
      <div className="sticky top-0 z-10 mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-medium text-success">Queue complete</p>
        <p className="text-xs text-muted-foreground">
          Every line is posted, linked, or marked decide-later. Use the table
          below to audit amounts or fix mistakes.
        </p>
      </div>
    );
  }

  const amountClass =
    line.amount_kurus > 0
      ? "text-success"
      : line.amount_kurus < 0
        ? "text-destructive"
        : "";

  return (
    <div className="sticky top-0 z-10 mb-4 space-y-2 rounded-lg border border-primary/30 bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {inQueue ? (
            <>
              Posting{" "}
              <span className="font-medium text-foreground">
                {queueIndex + 1} of {queueTotal}
              </span>
            </>
          ) : (
            <span className="font-medium text-foreground">Selected line</span>
          )}
          {" · "}
          {formatTrDate(line.transaction_date)}
          {line.reference ? ` · ${line.reference}` : ""}
        </span>
        <StatusBadge status={line.status} />
      </div>

      {line.status === "needs_review" && line.review_reason && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          {line.review_reason}
          {(line.candidate_supplier_ledger_entry_id ||
            line.candidate_account_transfer_id) &&
            " — confirm with Post to link without duplicating."}
        </p>
      )}

      <p
        className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium leading-snug"
        title={line.description}
      >
        {line.description}
      </p>

      <form
        onSubmit={inQueue ? handlePost : (e) => e.preventDefault()}
        className="rounded-md border border-border/60 bg-muted/15 p-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "shrink-0 tabular-nums text-sm font-semibold",
              amountClass,
            )}
          >
            {formatTry(line.amount_kurus)}
          </span>

          {inQueue ? (
            <>
              <div className="min-w-0 flex-[1_1_12rem] basis-[12rem]">
                {renderClassificationSelect("classify-type", false)}
              </div>
              <div className="min-w-0 flex-[2_1_10rem] basis-[10rem]">
                {targetControl("classify")}
              </div>
            </>
          ) : correctable ? (
            <div className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-medium text-foreground">
                {classificationLabel(line.classification)}
              </span>
              {postedTargetSummary ? (
                <>
                  {" · "}
                  <span className="text-muted-foreground">{postedTargetSummary}</span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {classificationLabel(line.classification)}
            </p>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {inQueue && (
              <Button
                type="submit"
                className="h-9 gap-1 px-4 text-xs"
                disabled={submitting || pickers.loading || amountMismatch}
              >
                {submitting ? "Posting…" : "Post"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}

            {correctable && (
              <Button
                type="button"
                variant="secondary"
                className="h-9 text-xs"
                onClick={openCorrectDialog}
              >
                Correct…
              </Button>
            )}
          </div>
        </div>

        {inQueue && selectedOption && (
          <p
            className={cn(
              "mt-2 text-[11px] leading-snug",
              amountMismatch ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {selectedOption.hint}
            {amountMismatch &&
              " — this line is the wrong direction for this type."}
          </p>
        )}

        {correctable && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Posted to ledger — use Correct to void and re-classify. Pickers are not
            editable here so a wrong supplier cannot be saved by accident.
          </p>
        )}
      </form>

      {inQueue && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="learn-as" className="text-[11px] text-muted-foreground">
              Learn as (optional rule token)
            </Label>
            <Input
              id="learn-as"
              className="mt-0.5 h-8 text-xs"
              value={learnAs}
              onChange={(e) => setLearnAs(e.target.value)}
              placeholder="e.g. BSMV, HAVALE ÜCRET"
            />
          </div>
          <p className="text-[11px] text-muted-foreground lg:max-w-md">
            Bank charges (BSM, havale, commission) →{" "}
            <strong className="font-medium text-foreground">Bank charges</strong>.
            &ldquo;Decide later&rdquo; does not post — find those under Skipped.
          </p>
        </div>
      )}

      {!inQueue && !correctable && (
        <p className="text-xs text-muted-foreground">
          {classificationLabel(line.classification)}
          {line.journal_entry_id
            ? " — posted to ledger."
            : " — no ledger entry (skipped or pending link)."}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog
        open={correctOpen}
        onClose={() => setCorrectOpen(false)}
        title="Correct line"
      >
        <form onSubmit={handleCorrect} className="space-y-3">
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
              onChange={(e) => setCorrectReason(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="correct-classification">New classification</Label>
            <div className="mt-1">
              {renderClassificationSelect("correct-classification", false)}
            </div>
          </div>
          {targetControl("correct")}
          {classification === "staff_payment" && (
            <p className="text-xs text-muted-foreground">
              Salary month and amount are chosen on the next step — same as when
              posting from the queue.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCorrectOpen(false)}>
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

      {line && entityId && selectedEmployee && (
        <StaffSalaryPaymentDialog
          open={salaryDialogOpen}
          onClose={() => {
            setSalaryDialogOpen(false);
            setSalaryDialogPurpose(null);
          }}
          entityId={entityId}
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name}
          payCurrency="TRY"
          source="statement"
          paymentDate={line.transaction_date}
          defaultCashMinor={Math.abs(line.amount_kurus)}
          lockCashAmount
          confirming={submitting}
          onConfirm={async (payload) => {
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
          }}
        />
      )}
    </div>
  );
}
