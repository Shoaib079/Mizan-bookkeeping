"use client";

/** One-line-at-a-time bank statement classification bar (search-bar style). */

import { ArrowRight } from "lucide-react";

import { ClassificationPicker } from "@/components/banking/classification-picker";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { StatementClassifyCorrectDialog } from "@/components/statement-classify-correct-dialog";
import { StatementClassifyTargetControl } from "@/components/statement-classify-target-control";
import { useStatementClassifyBar } from "@/components/use-statement-classify-bar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  BankStatementLine,
  ClassifyStatementLineResult,
} from "@/lib/banking-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { classificationLabel } from "@/lib/statement-classification-options";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";
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
  const s = useStatementClassifyBar({
    statementId,
    line,
    pickers,
    onPosted,
  });

  if (!line) {
    return (
      <div className="mb-4 shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
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
    <div className="mb-4 shrink-0 space-y-2 rounded-lg border border-primary/30 bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {s.inQueue ? (
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
        onSubmit={s.inQueue ? s.handlePost : (e) => e.preventDefault()}
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

          {s.inQueue ? (
            <>
              <div className="min-w-0 flex-[1_1_12rem] basis-[12rem]">
                <ClassificationPicker
                  id="classify-type"
                  amountKurus={line.amount_kurus}
                  value={s.classification}
                  onValueChange={s.setClassification}
                  className="h-9 w-full min-w-0 text-xs"
                  placement="below"
                  showHint
                />
              </div>
              <div className="min-w-0 flex-[2_1_10rem] basis-[10rem]">
                <StatementClassifyTargetControl
                  idPrefix="classify"
                  entityId={s.entityId}
                  pickers={pickers}
                  deliveryPlatformHint={s.deliveryPlatformHint}
                  values={s.targetValues}
                />
              </div>
            </>
          ) : s.correctable ? (
            <div className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-medium text-foreground">
                {classificationLabel(line.classification)}
              </span>
              {s.postedTargetSummary ? (
                <>
                  {" · "}
                  <span className="text-muted-foreground">
                    {s.postedTargetSummary}
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {classificationLabel(line.classification)}
            </p>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {s.inQueue && (
              <Button
                type="submit"
                className="h-9 gap-1 px-4 text-xs"
                disabled={s.submitting || pickers.loading || s.amountMismatch}
              >
                {s.submitting ? "Posting…" : "Post"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}

            {s.correctable && (
              <Button
                type="button"
                variant="secondary"
                className="h-9 text-xs"
                onClick={s.openCorrectDialog}
              >
                Correct…
              </Button>
            )}
          </div>
        </div>

        {s.inQueue && s.selectedOption && (
          <p
            className={cn(
              "mt-2 text-[11px] leading-snug",
              s.amountMismatch ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {s.selectedOption.hint}
            {s.amountMismatch &&
              " — this line is the wrong direction for this type."}
          </p>
        )}

        {s.correctable && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Posted to ledger — use Correct to void and re-classify. Pickers are
            not editable here so a wrong supplier cannot be saved by accident.
          </p>
        )}
      </form>

      {s.inQueue && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="learn-as" className="text-[11px] text-muted-foreground">
              Learn as (optional rule token)
            </Label>
            <Input
              id="learn-as"
              className="mt-0.5 h-8 text-xs"
              value={s.learnAs}
              onChange={(e) => s.setLearnAs(e.target.value)}
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

      {!s.inQueue && !s.correctable && (
        <p className="text-xs text-muted-foreground">
          {classificationLabel(line.classification)}
          {line.journal_entry_id
            ? " — posted to ledger."
            : " — no ledger entry (skipped or pending link)."}
        </p>
      )}

      {s.error && <p className="text-xs text-destructive">{s.error}</p>}

      <StatementClassifyCorrectDialog
        open={s.correctOpen}
        onClose={() => s.setCorrectOpen(false)}
        amountKurus={line.amount_kurus}
        classification={s.classification}
        onClassificationChange={s.setClassification}
        correctReason={s.correctReason}
        onCorrectReasonChange={s.setCorrectReason}
        submitting={s.submitting}
        entityId={s.entityId}
        pickers={pickers}
        deliveryPlatformHint={s.deliveryPlatformHint}
        targetValues={s.targetValues}
        onSubmit={s.handleCorrect}
      />

      {line && s.entityId && s.selectedEmployee && (
        <StaffSalaryPaymentDialog
          open={s.salaryDialogOpen}
          onClose={() => {
            s.setSalaryDialogOpen(false);
            s.setSalaryDialogPurpose(null);
          }}
          entityId={s.entityId}
          employeeId={s.selectedEmployee.id}
          employeeName={s.selectedEmployee.name}
          payCurrency="TRY"
          source="statement"
          paymentDate={line.transaction_date}
          defaultCashMinor={Math.abs(line.amount_kurus)}
          lockCashAmount
          confirming={s.submitting}
          onConfirm={async (payload) => {
            await s.onSalaryConfirm(payload);
          }}
        />
      )}
    </div>
  );
}
