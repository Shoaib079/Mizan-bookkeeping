"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";

type ExpenseAccountOption = ChartAccount;

export type CorrectableSupplierInvoiceRow = {
  journal_entry_id: string;
  movement_date: string;
  amount_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  supplierId: string;
  invoice: CorrectableSupplierInvoiceRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function vatBreakdownFromGross(grossKurus: number) {
  const netKurus = Math.round((grossKurus * 5) / 6);
  const vatKurus = grossKurus - netKurus;
  return {
    net_kurus: netKurus,
    gross_kurus: grossKurus,
    vat_breakdown: [
      { rate_percent: 20, base_kurus: netKurus, vat_kurus: vatKurus },
    ],
  };
}

export function CorrectSupplierInvoiceForm({
  open,
  supplierId,
  invoice,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [accounts, setAccounts] = useState<ExpenseAccountOption[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [grossText, setGrossText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const chart = await apiFetch<{ items: ExpenseAccountOption[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const expenses = filterExpenseAccounts(chart.items);
    setAccounts(expenses);
    const preferred = findExpenseAccountByCode(chart.items, "5200");
    if (preferred) setExpenseAccountId(preferred.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !invoice) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(invoice.movement_date));
    setGrossText(formatKurus(invoice.amount_kurus));
    setDescription(invoice.description);
    setReason("");
    setError(null);
  }, [open, invoice, loadAccounts]);

  const grossKurus = parseTryToKurus(grossText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !invoice || !expenseAccountId) return;
    const invoiceDate = parseTrDate(dateText);
    if (!invoiceDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (grossKurus === null || grossKurus <= 0) {
      setError("Enter a valid gross amount.");
      return;
    }
    const totals = vatBreakdownFromGross(grossKurus);
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/suppliers/${supplierId}/invoices/${invoice.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  invoice_date: invoiceDate,
                  description: description.trim() || "Supplier invoice",
                  actor_id: actorId,
                  expense_account_id: expenseAccountId,
                  net_kurus: totals.net_kurus,
                  gross_kurus: totals.gross_kurus,
                  vat_breakdown: totals.vat_breakdown,
                  reason: reason.trim() || null,
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("Invoice corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Correct supplier invoice" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="csi-date">Invoice date</Label>
            <DateInput id="csi-date" value={dateText} onChange={setDateText} required />
          </div>
          <div>
            <Label htmlFor="csi-gross">Gross amount (TRY)</Label>
            <MoneyInput id="csi-gross" value={grossText} onChange={setGrossText} required />
          </div>
          <div>
            <Label htmlFor="csi-expense">Expense account</Label>
            <Combobox
              id="csi-expense"
              value={expenseAccountId}
              onValueChange={setExpenseAccountId}
              options={accounts.map((a) => ({
                value: a.id,
                label: formatExpenseAccountLabel(a),
              }))}
              placeholder="Expense account…"
            />
          </div>
          <div>
            <Label htmlFor="csi-desc">Description</Label>
            <Input
              id="csi-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="csi-reason">Correction reason (optional)</Label>
            <Input id="csi-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={submitting || grossKurus === null || grossKurus <= 0 || !expenseAccountId}
          >
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
