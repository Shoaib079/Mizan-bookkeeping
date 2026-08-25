"use client";

/** Target Combobox tree for statement classify / correct (by classification kind). */

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import type { StatementLineClassification } from "@/lib/banking-types";
import {
  chartAccountComboboxOptions,
  expenseAccountComboboxOptions,
} from "@/lib/expense-accounts";
import { classificationOption } from "@/lib/statement-classification-options";
import {
  deliveryPlatformComboboxOptions,
  type StatementClassificationPickers,
} from "@/lib/use-statement-classification-pickers";

export type StatementClassifyTargetValues = {
  classification: StatementLineClassification;
  supplierId: string;
  setSupplierId: (id: string) => void;
  customerId: string;
  setCustomerId: (id: string) => void;
  employeeId: string;
  setEmployeeId: (id: string) => void;
  partnerId: string;
  setPartnerId: (id: string) => void;
  capitalNote: string;
  setCapitalNote: (note: string) => void;
  counterpartId: string;
  setCounterpartId: (id: string) => void;
  creditCardId: string;
  setCreditCardId: (id: string) => void;
  expenseAccountId: string;
  setExpenseAccountId: (id: string) => void;
  incomeAccountId: string;
  setIncomeAccountId: (id: string) => void;
  deliveryPlatformId: string;
  setDeliveryPlatformId: (id: string) => void;
};

type Props = {
  idPrefix?: string;
  entityId: string | null;
  pickers: StatementClassificationPickers;
  deliveryPlatformHint: string | null;
  values: StatementClassifyTargetValues;
  /** Compact bulk-bar copy/layout (no delivery meta; capital note not HTML-required). */
  variant?: "default" | "bulk";
};

export function StatementClassifyTargetControl({
  idPrefix = "classify",
  entityId,
  pickers,
  deliveryPlatformHint,
  values,
  variant = "default",
}: Props) {
  const bulk = variant === "bulk";
  const targetKind = classificationOption(values.classification)?.target;

  if (targetKind === "supplier") {
    return (
      <Combobox
        id={`${idPrefix}-supplier`}
        value={values.supplierId}
        onValueChange={values.setSupplierId}
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
        value={values.customerId}
        onValueChange={values.setCustomerId}
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
        value={values.employeeId}
        onValueChange={values.setEmployeeId}
        options={pickers.employees.map((e) => ({ value: e.id, label: e.name }))}
        placeholder="Employee…"
        className="h-9 w-full min-w-0 text-xs"
      />
    );
  }
  if (targetKind === "partner") {
    return (
      <div
        className={
          bulk
            ? "flex w-full min-w-0 flex-col gap-1 sm:flex-row"
            : "flex w-full min-w-0 flex-col gap-1 sm:flex-row sm:items-center"
        }
      >
        <Combobox
          id={`${idPrefix}-partner`}
          value={values.partnerId}
          onValueChange={values.setPartnerId}
          options={pickers.partners.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Partner…"
          className="h-9 w-full min-w-0 text-xs"
        />
        {values.classification === "partner_capital_contribution" && (
          <Input
            id={`${idPrefix}-capital-note`}
            value={values.capitalNote}
            onChange={(e) => values.setCapitalNote(e.target.value)}
            placeholder="Note — why they invested…"
            className="h-9 w-full min-w-0 text-xs"
            required={!bulk}
          />
        )}
      </div>
    );
  }
  if (targetKind === "transfer") {
    return (
      <Combobox
        id={`${idPrefix}-transfer`}
        value={values.counterpartId}
        onValueChange={values.setCounterpartId}
        options={pickers.moneyAccounts.map((a) => ({
          value: a.id,
          label: a.name,
        }))}
        placeholder={bulk ? "Other account…" : "Account…"}
        className="h-9 w-full min-w-0 text-xs"
      />
    );
  }
  if (targetKind === "credit_card") {
    return (
      <Combobox
        id={`${idPrefix}-card`}
        value={values.creditCardId}
        onValueChange={values.setCreditCardId}
        options={pickers.creditCards.map((a) => ({
          value: a.id,
          label: a.name,
        }))}
        placeholder={bulk ? "Credit card…" : "Card…"}
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
            value={values.expenseAccountId}
            onValueChange={values.setExpenseAccountId}
            options={expenseAccountComboboxOptions(pickers.expenseAccounts)}
            placeholder={
              bulk ? "Expense GL…" : "Expense GL — rent, utilities, repairs…"
            }
            className="h-9 w-full min-w-0 text-xs"
          />
        </div>
        {entityId && (
          <AddExpenseCategoryButton
            entityId={entityId}
            className="shrink-0 px-2 text-xs"
            onCreated={async (account) => {
              pickers.appendExpenseAccount(account);
              values.setExpenseAccountId(account.id);
            }}
          />
        )}
      </div>
    );
  }
  if (targetKind === "income") {
    return (
      <Combobox
        id={`${idPrefix}-income`}
        value={values.incomeAccountId}
        onValueChange={values.setIncomeAccountId}
        options={chartAccountComboboxOptions(pickers.incomeAccounts)}
        placeholder={
          bulk
            ? "Income GL…"
            : "Income GL — interest, refunds, other income…"
        }
        emptyMessage={
          bulk
            ? "No income accounts"
            : "No income accounts — add one under Chart of accounts"
        }
        className="h-9 w-full min-w-0 text-xs"
      />
    );
  }
  if (targetKind === "delivery_platform") {
    return (
      <div className="space-y-1">
        <Combobox
          id={`${idPrefix}-platform`}
          value={values.deliveryPlatformId}
          onValueChange={values.setDeliveryPlatformId}
          options={deliveryPlatformComboboxOptions(pickers.deliveryPlatforms)}
          placeholder={bulk ? "Delivery platform…" : "Platform…"}
          emptyMessage={
            bulk
              ? undefined
              : pickers.deliveryPlatformsError
                ? "Could not load platforms"
                : "No delivery platforms — add under Delivery → Platforms"
          }
          className="h-9 w-full min-w-0 text-xs"
        />
        {!bulk && pickers.deliveryPlatformsError && (
          <p className="text-[11px] text-destructive">
            {pickers.deliveryPlatformsError}
          </p>
        )}
        {!bulk && deliveryPlatformHint && (
          <p className="text-[11px] text-warning">{deliveryPlatformHint}</p>
        )}
      </div>
    );
  }
  return null;
}
