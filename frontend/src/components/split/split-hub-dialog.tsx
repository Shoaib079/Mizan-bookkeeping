"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { formatTry } from "@/lib/money";

import type {
  ExpenseCandidate,
  PaymentCandidate,
  PartnerRow,
  Selected,
} from "@/components/split/split-hub-types";

type Props = {
  selected: Selected;
  title: string;
  onClose: () => void;
  selectedExpense: ExpenseCandidate | null;
  selectedPayment: PaymentCandidate | null;
  remaining: number | null;
  restaurantKurus: number | null;
  partners: PartnerRow[];
  partnerId: string;
  onPartnerIdChange: (value: string) => void;
  personalText: string;
  onPersonalTextChange: (value: string) => void;
  expenseAccounts: ChartAccount[];
  expenseAccountId: string;
  onExpenseAccountIdChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  formError: string | null;
  submitting: boolean;
  onSubmit: (event: FormEvent) => void;
};

export function SplitHubDialog({
  selected,
  title,
  onClose,
  selectedExpense,
  selectedPayment,
  remaining,
  restaurantKurus,
  partners,
  partnerId,
  onPartnerIdChange,
  personalText,
  onPersonalTextChange,
  expenseAccounts,
  expenseAccountId,
  onExpenseAccountIdChange,
  note,
  onNoteChange,
  formError,
  submitting,
  onSubmit,
}: Props) {
  return (
    <FormDialogShell open={selected !== null} title={title} onClose={onClose}>
      {(selectedExpense || selectedPayment) && (
        <form onSubmit={onSubmit} className="space-y-3">
          {selectedPayment && (
            <p className="text-sm font-medium">{selectedPayment.supplier_name}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {selectedExpense?.description ?? selectedPayment?.description}
          </p>
          <p className="text-sm tabular-nums">
            Remaining: {remaining != null ? formatTry(remaining) : "—"}
          </p>
          <div>
            <Label htmlFor="split-partner">Partner</Label>
            <Combobox
              id="split-partner"
              value={partnerId}
              onValueChange={onPartnerIdChange}
              options={partners.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              placeholder="Partner…"
              required
            />
          </div>
          <div>
            <Label htmlFor="split-personal">Personal amount (TRY)</Label>
            <MoneyInput
              id="split-personal"
              value={personalText}
              onChange={onPersonalTextChange}
              required
            />
          </div>
          <div>
            <Label>Restaurant amount (auto)</Label>
            <p className="mt-1 text-sm tabular-nums">
              {restaurantKurus == null
                ? "—"
                : restaurantKurus < 0
                  ? "Personal exceeds remaining"
                  : formatTry(restaurantKurus)}
            </p>
          </div>
          {selected?.kind === "supplier_payment" && (
            <div>
              <Label htmlFor="split-expense-account">
                Expense account (personal reverse)
              </Label>
              <Combobox
                id="split-expense-account"
                value={expenseAccountId}
                onValueChange={onExpenseAccountIdChange}
                options={expenseAccounts.map((a) => ({
                  value: a.id,
                  label: formatExpenseAccountLabel(a),
                }))}
                placeholder="Expense account…"
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="split-note">Note</Label>
            <Input
              id="split-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              required
              maxLength={512}
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording…" : "Record split"}
          </Button>
        </form>
      )}
    </FormDialogShell>
  );
}
