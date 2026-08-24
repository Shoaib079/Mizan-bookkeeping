"use client";

/** Inline statement line review — confirm, correct, create supplier (unified hub). */

import { StatementLineReviewActions } from "@/components/statement-line-review-actions";
import { StatementLineReviewCorrectDialog } from "@/components/statement-line-review-correct-dialog";
import { StatementLineReviewHeader } from "@/components/statement-line-review-header";
import { useStatementLineReviewRow } from "@/components/use-statement-line-review-row";
import type { StatementLineReview } from "@/lib/banking-types";
import { classificationLabel } from "@/lib/statement-classification-options";

type Props = {
  line: StatementLineReview;
  onUpdated: () => void;
  bulkChecked?: boolean;
  bulkSelectable?: boolean;
  onToggleBulkChecked?: (checked: boolean) => void;
};

export function StatementLineReviewRow({
  line,
  onUpdated,
  bulkChecked = false,
  bulkSelectable = false,
  onToggleBulkChecked,
}: Props) {
  const s = useStatementLineReviewRow({ line, onUpdated });

  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        s.isRuleAuto ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
      }`}
    >
      <StatementLineReviewHeader
        line={line}
        isRuleAuto={s.isRuleAuto}
        canAct={s.canAct}
        expanded={s.expanded}
        onToggleExpanded={() => s.setExpanded((value) => !value)}
        bulkChecked={bulkChecked}
        bulkSelectable={bulkSelectable}
        onToggleBulkChecked={onToggleBulkChecked}
      />

      {line.status === "needs_review" && line.review_reason && (
        <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {line.review_reason}
        </p>
      )}

      {line.suggestion && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">Suggestion</p>
          <p className="text-muted-foreground">
            {classificationLabel(line.suggestion.classification)}
            {line.suggestion.supplier_id && " · supplier linked in rule"}
            {" · "}
            <span className="capitalize">{line.suggestion.confidence}</span>{" "}
            confidence
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {line.suggestion.reason}
          </p>
        </div>
      )}

      {s.expanded && s.canAct && (
        <StatementLineReviewActions
          line={line}
          entityId={s.entityId}
          learnAs={s.learnAs}
          onLearnAsChange={s.setLearnAs}
          classification={s.classification}
          onClassificationChange={s.setClassification}
          suppliers={s.suppliers}
          customers={s.customers}
          moneyAccounts={s.moneyAccounts}
          creditCards={s.creditCards}
          expenseAccounts={s.expenseAccounts}
          incomeAccounts={s.incomeAccounts}
          supplierId={s.supplierId}
          onSupplierIdChange={s.setSupplierId}
          customerId={s.customerId}
          onCustomerIdChange={s.setCustomerId}
          counterpartId={s.counterpartId}
          onCounterpartIdChange={s.setCounterpartId}
          creditCardId={s.creditCardId}
          onCreditCardIdChange={s.setCreditCardId}
          expenseAccountId={s.expenseAccountId}
          onExpenseAccountIdChange={s.setExpenseAccountId}
          incomeAccountId={s.incomeAccountId}
          onIncomeAccountIdChange={s.setIncomeAccountId}
          supplierName={s.supplierName}
          onSupplierNameChange={s.setSupplierName}
          submitting={s.submitting}
          error={s.error}
          correctable={s.correctable}
          isRuleAuto={s.isRuleAuto}
          onConfirmSuggestion={() => void s.handleConfirm()}
          onClassify={s.handleClassify}
          onCreateSupplier={() => void s.handleCreateSupplier()}
          onOpenCorrect={s.openCorrectDialog}
          onExpenseAccountCreated={s.onExpenseAccountCreated}
        />
      )}

      <StatementLineReviewCorrectDialog
        open={s.correctOpen}
        onClose={() => s.setCorrectOpen(false)}
        lineId={line.id}
        amountKurus={line.amount_kurus}
        correctReason={s.correctReason}
        onCorrectReasonChange={s.setCorrectReason}
        correctClassification={s.correctClassification}
        onCorrectClassificationChange={s.setCorrectClassification}
        suppliers={s.suppliers}
        supplierId={s.supplierId}
        onSupplierIdChange={s.setSupplierId}
        submitting={s.submitting}
        error={s.error}
        onSubmit={s.handleCorrect}
      />
    </div>
  );
}
