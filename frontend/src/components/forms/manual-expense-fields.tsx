"use client";

/** Expense field grid for ManualExpenseForm — shared embedded + dialog layouts. */

import { FormEvent } from "react";

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import { ExpenseItemTypeahead } from "@/components/forms/expense-item-typeahead";
import { type PartnerRow } from "@/components/forms/partner-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  formatExpenseAccountLabel,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { isSuggestedAccountActive } from "@/lib/expense-account-suggest";
import type { ExpenseItemSearchResult } from "@/lib/expense-item-search";
import type { MoneyAccount, PaymentMode } from "@/lib/manual-expense-draft";

type Props = {
  layout: "embedded" | "dialog";
  entityId: string;
  submitting: boolean;
  error: string | null;
  itemName: string;
  confirmExpenseItemId: string | null;
  onItemNameChange: (next: string) => void;
  onPickItem: (item: ExpenseItemSearchResult) => void;
  amountText: string;
  setAmountText: (value: string) => void;
  dateText: string;
  setDateText: (value: string) => void;
  expenseAccounts: ChartAccount[];
  setExpenseAccounts: (
    updater: (prev: ChartAccount[]) => ChartAccount[],
  ) => void;
  expenseAccountId: string;
  setExpenseAccountId: (id: string) => void;
  suggestedAccountId: string | null;
  suggestedSource: string | null;
  markAccountPickedByUser: () => void;
  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  showCashDrawerPicker: boolean;
  cashAccounts: MoneyAccount[];
  moneyAccountId: string;
  setMoneyAccountId: (id: string) => void;
  partners: PartnerRow[];
  partnerId: string;
  setPartnerId: (id: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  markTouched: () => void;
  onSubmit: (event: FormEvent) => void;
};

export function ManualExpenseFields({
  layout,
  entityId,
  submitting,
  error,
  itemName,
  confirmExpenseItemId,
  onItemNameChange,
  onPickItem,
  amountText,
  setAmountText,
  dateText,
  setDateText,
  expenseAccounts,
  setExpenseAccounts,
  expenseAccountId,
  setExpenseAccountId,
  suggestedAccountId,
  suggestedSource,
  markAccountPickedByUser,
  paymentMode,
  setPaymentMode,
  showCashDrawerPicker,
  cashAccounts,
  moneyAccountId,
  setMoneyAccountId,
  partners,
  partnerId,
  setPartnerId,
  notes,
  setNotes,
  markTouched,
  onSubmit,
}: Props) {
  const embedded = layout === "embedded";

  const notesField = (
    <div>
      <Label htmlFor="exp-notes">Notes (optional)</Label>
      <Textarea
        id="exp-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Receipt #, supplier, who paid…"
        maxLength={512}
        disabled={submitting}
      />
    </div>
  );

  const accountSelect = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="exp-account">Expense account</Label>
        {entityId && (
          <AddExpenseCategoryButton
            entityId={entityId}
            onCreated={async (account) => {
              setExpenseAccounts((prev) => mergeExpenseAccounts(prev, account));
              setExpenseAccountId(account.id);
              markAccountPickedByUser();
            }}
          />
        )}
      </div>
      <Select
        id="exp-account"
        value={expenseAccountId}
        onChange={(e) => {
          markAccountPickedByUser();
          setExpenseAccountId(e.target.value);
        }}
      >
        <option value="">Select category…</option>
        {expenseAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {formatExpenseAccountLabel(a)}
          </option>
        ))}
      </Select>
      {isSuggestedAccountActive(expenseAccountId, suggestedAccountId) && (
        <p className="text-xs text-muted-foreground">
          Suggested account
          {suggestedSource === "ai"
            ? " (AI)"
            : suggestedSource === "learned"
              ? " (learned)"
              : ""}
          {embedded ? "" : " — you can change it before saving."}
        </p>
      )}
    </div>
  );

  const paymentControls = embedded ? (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="exp-payment">Payment</Label>
        <Select
          id="exp-payment"
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
        >
          <option value="cash">Cash drawer</option>
          <option value="partner">Partner paid (owe partner)</option>
        </Select>
      </div>
      {showCashDrawerPicker ? (
        <CashDrawerPicker
          id="exp-cash"
          accounts={cashAccounts}
          value={moneyAccountId}
          onValueChange={setMoneyAccountId}
        />
      ) : paymentMode === "partner" ? (
        <div>
          <Label htmlFor="exp-partner">Partner</Label>
          <Combobox
            id="exp-partner"
            value={partnerId}
            onValueChange={setPartnerId}
            options={partners.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            placeholder="Partner…"
          />
        </div>
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}
    </div>
  ) : (
    <>
      <div>
        <Label htmlFor="exp-payment">Payment</Label>
        <Select
          id="exp-payment"
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
        >
          <option value="cash">Cash drawer</option>
          <option value="partner">Partner paid (owe partner)</option>
        </Select>
      </div>
      {paymentMode === "cash" ? (
        <CashDrawerPicker
          id="exp-cash"
          accounts={cashAccounts}
          value={moneyAccountId}
          onValueChange={setMoneyAccountId}
        />
      ) : (
        <div>
          <Label htmlFor="exp-partner">Partner</Label>
          <Combobox
            id="exp-partner"
            value={partnerId}
            onValueChange={setPartnerId}
            options={partners.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            placeholder="Partner…"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Repay the partner later under Record → Partner reimb.
          </p>
        </div>
      )}
    </>
  );

  return (
    <form
      onSubmit={onSubmit}
      onChange={markTouched}
      className={embedded ? "space-y-3" : "space-y-3"}
    >
      {embedded && (
        <div>
          <Label htmlFor="exp-date">Date</Label>
          <DateInput
            id="exp-date"
            value={dateText}
            onChange={setDateText}
            required
            showLateNightHint
          />
        </div>
      )}
      <ExpenseItemTypeahead
        entityId={entityId}
        value={itemName}
        confirmedItemId={confirmExpenseItemId}
        onValueChange={onItemNameChange}
        onPickItem={onPickItem}
        disabled={submitting}
      />
      <div>
        <Label htmlFor="exp-amount">Amount (TRY)</Label>
        <MoneyInput
          id="exp-amount"
          placeholder="e.g. 150,00"
          value={amountText}
          onChange={setAmountText}
          required
        />
      </div>
      {accountSelect}
      {paymentControls}
      {notesField}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Recording…" : "Record expense"}
      </Button>
    </form>
  );
}
