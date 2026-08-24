"use client";

/** Expanded classify / create-supplier / correct CTA for StatementLineReviewRow. */

import { FormEvent } from "react";

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { ClassificationPicker } from "@/components/banking/classification-picker";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import type {
  StatementLineClassification,
  StatementLineReview,
} from "@/lib/banking-types";
import {
  chartAccountComboboxOptions,
  expenseAccountComboboxOptions,
  type ChartAccount,
} from "@/lib/expense-accounts";

type Named = { id: string; name: string };

type Props = {
  line: StatementLineReview;
  entityId: string | null;
  learnAs: string;
  onLearnAsChange: (value: string) => void;
  classification: StatementLineClassification;
  onClassificationChange: (value: StatementLineClassification) => void;
  suppliers: Named[];
  customers: Named[];
  moneyAccounts: Named[];
  creditCards: Named[];
  expenseAccounts: ChartAccount[];
  incomeAccounts: ChartAccount[];
  supplierId: string;
  onSupplierIdChange: (id: string) => void;
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  counterpartId: string;
  onCounterpartIdChange: (id: string) => void;
  creditCardId: string;
  onCreditCardIdChange: (id: string) => void;
  expenseAccountId: string;
  onExpenseAccountIdChange: (id: string) => void;
  incomeAccountId: string;
  onIncomeAccountIdChange: (id: string) => void;
  supplierName: string;
  onSupplierNameChange: (name: string) => void;
  submitting: boolean;
  error: string | null;
  correctable: boolean;
  isRuleAuto: boolean;
  onConfirmSuggestion: () => void;
  onClassify: (event: FormEvent) => void;
  onCreateSupplier: () => void;
  onOpenCorrect: () => void;
  onExpenseAccountCreated: (account: ChartAccount) => void;
};

export function StatementLineReviewActions({
  line,
  entityId,
  learnAs,
  onLearnAsChange,
  classification,
  onClassificationChange,
  suppliers,
  customers,
  moneyAccounts,
  creditCards,
  expenseAccounts,
  incomeAccounts,
  supplierId,
  onSupplierIdChange,
  customerId,
  onCustomerIdChange,
  counterpartId,
  onCounterpartIdChange,
  creditCardId,
  onCreditCardIdChange,
  expenseAccountId,
  onExpenseAccountIdChange,
  incomeAccountId,
  onIncomeAccountIdChange,
  supplierName,
  onSupplierNameChange,
  submitting,
  error,
  correctable,
  isRuleAuto,
  onConfirmSuggestion,
  onClassify,
  onCreateSupplier,
  onOpenCorrect,
  onExpenseAccountCreated,
}: Props) {
  const showClassify =
    line.status === "needs_review" || line.status === "imported";

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div>
        <Label htmlFor={`learn-as-${line.id}`}>Learn as</Label>
        <Input
          id={`learn-as-${line.id}`}
          value={learnAs}
          onChange={(event) => onLearnAsChange(event.target.value)}
          placeholder={line.description}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Shorten to the counterparty (e.g. MIGROS) so the rule matches varied
          descriptions. Leave as-is to learn the full description.
        </p>
      </div>

      {showClassify && (
        <>
          {line.suggestion && (
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void onConfirmSuggestion()}
            >
              {submitting ? "Confirming…" : "Confirm suggestion"}
            </Button>
          )}

          <form onSubmit={onClassify} className="space-y-3">
            <div>
              <Label htmlFor={`cls-${line.id}`}>Classification</Label>
              <ClassificationPicker
                id={`cls-${line.id}`}
                amountKurus={line.amount_kurus}
                value={classification}
                onValueChange={onClassificationChange}
                showHint
              />
            </div>

            {classification === "supplier_payment" && (
              <div>
                <Label htmlFor={`sup-${line.id}`}>Supplier</Label>
                <Combobox
                  id={`sup-${line.id}`}
                  value={supplierId}
                  onValueChange={onSupplierIdChange}
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: supplier.name,
                  }))}
                  placeholder="Supplier…"
                />
              </div>
            )}

            {classification === "transfer" && (
              <div>
                <Label htmlFor={`cp-${line.id}`}>Counterpart account</Label>
                <Combobox
                  id={`cp-${line.id}`}
                  value={counterpartId}
                  onValueChange={onCounterpartIdChange}
                  options={moneyAccounts.map((account) => ({
                    value: account.id,
                    label: account.name,
                  }))}
                  placeholder="Counterpart account…"
                />
              </div>
            )}

            {classification === "credit_card_payment" && (
              <div>
                <Label htmlFor={`cc-${line.id}`}>Credit card</Label>
                <Combobox
                  id={`cc-${line.id}`}
                  value={creditCardId}
                  onValueChange={onCreditCardIdChange}
                  options={creditCards.map((account) => ({
                    value: account.id,
                    label: account.name,
                  }))}
                  placeholder="Credit card…"
                />
              </div>
            )}

            {classification === "customer_payment" && (
              <div>
                <Label htmlFor={`cust-${line.id}`}>Customer</Label>
                <Combobox
                  id={`cust-${line.id}`}
                  value={customerId}
                  onValueChange={onCustomerIdChange}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                  }))}
                  placeholder="Customer…"
                />
              </div>
            )}

            {classification === "rent_utility" ||
            classification === "store_purchase" ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`exp-${line.id}`}>Expense account</Label>
                  {entityId && (
                    <AddExpenseCategoryButton
                      entityId={entityId}
                      onCreated={async (account) => {
                        onExpenseAccountCreated(account);
                      }}
                    />
                  )}
                </div>
                <Combobox
                  id={`exp-${line.id}`}
                  value={expenseAccountId}
                  onValueChange={onExpenseAccountIdChange}
                  options={expenseAccountComboboxOptions(expenseAccounts)}
                  placeholder="Expense account…"
                />
              </div>
            ) : null}

            {classification === "other_income" && (
              <div>
                <Label htmlFor={`inc-${line.id}`}>Income account</Label>
                <Combobox
                  id={`inc-${line.id}`}
                  value={incomeAccountId}
                  onValueChange={onIncomeAccountIdChange}
                  options={chartAccountComboboxOptions(incomeAccounts)}
                  placeholder="Income account…"
                  emptyMessage="No income accounts"
                />
              </div>
            )}

            <Button type="submit" variant="secondary" disabled={submitting}>
              {submitting ? "Posting…" : "Classify & post"}
            </Button>
          </form>

          <div className="space-y-3 rounded-md border border-dashed border-border p-3">
            <p className="text-sm font-medium">Create supplier from this line</p>
            <div>
              <Label htmlFor={`sup-name-${line.id}`}>Supplier name</Label>
              <Input
                id={`sup-name-${line.id}`}
                value={supplierName}
                onChange={(event) => onSupplierNameChange(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => void onCreateSupplier()}
            >
              {submitting ? "Creating…" : "Create supplier & learn"}
            </Button>
          </div>
        </>
      )}

      {correctable && (
        <Button
          type="button"
          variant={isRuleAuto ? "primary" : "secondary"}
          disabled={submitting}
          onClick={onOpenCorrect}
        >
          Void / reverse & re-classify
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
