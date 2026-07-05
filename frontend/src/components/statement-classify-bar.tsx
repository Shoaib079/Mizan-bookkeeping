"use client";

/** One-line-at-a-time bank statement classification bar (search-bar style). */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  BankStatementLine,
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
  suggestClassificationForLine,
  suggestDeliveryPlatformId,
  suggestSupplierId,
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
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Props = {
  statementId: string;
  line: BankStatementLine | null;
  queueIndex: number;
  queueTotal: number;
  pickers: StatementClassificationPickers;
  onPosted: () => void;
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

  const selectedEmployee = useMemo(
    () => pickers.employees.find((e) => e.id === employeeId) ?? null,
    [employeeId, pickers.employees],
  );
  const inQueue = line != null && isQueueLine(line);
  const correctable = line != null && isCorrectableLine(line) && !inQueue;

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line?.id, submitIdempotency]);

  useEffect(() => {
    if (!line) return;
    setLearnAs(line.description);
    setError(null);
    setCorrectOpen(false);
    setCorrectReason("");

    if (line.suggestion) {
      setClassification(line.suggestion.classification);
      if (line.suggestion.supplier_id) {
        setSupplierId(line.suggestion.supplier_id);
      } else if (pickers.suppliers[0]) {
        setSupplierId(pickers.suppliers[0].id);
      }
      if (line.suggestion.expense_account_id) {
        setExpenseAccountId(line.suggestion.expense_account_id);
      } else if (pickers.expenseAccounts[0]) {
        setExpenseAccountId(pickers.expenseAccounts[0].id);
      }
    } else {
      setClassification(suggestClassificationForLine(line));
      if (pickers.suppliers[0]) setSupplierId(pickers.suppliers[0].id);
      if (pickers.expenseAccounts[0]) setExpenseAccountId(pickers.expenseAccounts[0].id);
      const suggestedSupplier = suggestSupplierId(line.description, pickers.suppliers);
      if (suggestedSupplier) setSupplierId(suggestedSupplier);
    }

    if (pickers.customers[0]) setCustomerId(pickers.customers[0].id);
    if (pickers.employees[0]) setEmployeeId(pickers.employees[0].id);
    if (pickers.partners[0]) setPartnerId(pickers.partners[0].id);
    if (pickers.moneyAccounts[0]) setCounterpartId(pickers.moneyAccounts[0].id);
    if (pickers.creditCards[0]) setCreditCardId(pickers.creditCards[0].id);
    const suggestedPlatform = suggestDeliveryPlatformId(
      line.description,
      pickers.deliveryPlatforms,
    );
    setDeliveryPlatformId(suggestedPlatform ?? "");
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
      onPosted();
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
      setSalaryDialogOpen(true);
      return;
    }
    await executePost();
  }

  async function handleCorrect(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !line || !correctReason.trim()) {
      setError("Correction reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await correctStatementLine(
        entityId,
        statementId,
        line.id,
        {
          ...(buildPayload(classification) as Parameters<
            typeof correctStatementLine
          >[3]),
          reason: correctReason.trim(),
        },
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      toast("Line corrected and re-posted");
      setCorrectOpen(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  const targetKind = classificationOption(classification)?.target;

  function targetControl() {
    if (targetKind === "supplier") {
      return (
        <Combobox
          id="classify-supplier"
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
          id="classify-customer"
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
          id="classify-employee"
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
          id="classify-partner"
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
          id="classify-transfer"
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
          id="classify-card"
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
        <Combobox
          id="classify-expense"
          value={expenseAccountId}
          onValueChange={setExpenseAccountId}
          options={pickers.expenseAccounts.map((a) => ({
            value: a.id,
            label: `${a.code} — ${a.name_en}`,
          }))}
          placeholder="Expense GL — rent, utilities, repairs…"
          className="h-9 w-full min-w-0 text-xs"
        />
      );
    }
    if (targetKind === "delivery_platform") {
      return (
        <div className="space-y-1">
          <Combobox
            id="classify-platform"
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

          <div className="min-w-0 flex-[1_1_12rem] basis-[12rem]">
            {renderClassificationSelect("classify-type", !inQueue && !correctOpen)}
          </div>

          <div className="min-w-0 flex-[2_1_10rem] basis-[10rem]">
            {targetControl()}
          </div>

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
                onClick={() => setCorrectOpen(true)}
              >
                Correct…
              </Button>
            )}
          </div>
        </div>

        {selectedOption && (
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
          {targetControl()}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCorrectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Correcting…" : "Correct & re-post"}
            </Button>
          </div>
        </form>
      </Dialog>

      {line && entityId && selectedEmployee && (
        <StaffSalaryPaymentDialog
          open={salaryDialogOpen}
          onClose={() => setSalaryDialogOpen(false)}
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
            await executePost({
              period_year: payload.period_year,
              period_month: payload.period_month,
              period_salary_minor: payload.period_salary_minor,
            });
          }}
        />
      )}
    </div>
  );
}
