"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  findExpenseAccountByCode,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

const NO_SUPPLIER = "__none__";

type SupplierOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

export function PartnerSplitBuyForm({
  open,
  onClose,
  partnerId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [supplierId, setSupplierId] = useState(NO_SUPPLIER);
  const [dateText, setDateText] = useState("");
  const [totalText, setTotalText] = useState("");
  const [personalText, setPersonalText] = useState("");
  const [note, setNote] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [chart, supplierList] = await Promise.all([
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: SupplierOption[] }>(
        `/entities/${entityId}/suppliers?include_inactive=false&limit=200`,
      ),
    ]);
    const expenses = filterExpenseAccounts(chart.items);
    setExpenseAccounts(expenses);
    const general = findExpenseAccountByCode(chart.items, "5200");
    if (general) setExpenseAccountId(general.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
    setSuppliers(supplierList.items);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      setTotalText("");
      setPersonalText("");
      setNote("");
      setInvoiceNumber("");
      setSupplierId(NO_SUPPLIER);
      setError(null);
      void loadOptions().catch(() => undefined);
    }
  }, [open, loadOptions]);

  const selectedSupplierId =
    supplierId === NO_SUPPLIER || !supplierId ? null : supplierId;

  const amounts = useMemo(() => {
    const totalKurus = parseTryToKurus(totalText || "0");
    const personalKurus = parseTryToKurus(personalText || "0");
    if (totalKurus === null || personalKurus === null) {
      return {
        totalKurus: null as number | null,
        personalKurus: null as number | null,
        restaurantKurus: null as number | null,
      };
    }
    return {
      totalKurus,
      personalKurus,
      restaurantKurus: totalKurus - personalKurus,
    };
  }, [totalText, personalText]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const { totalKurus, personalKurus, restaurantKurus } = amounts;
    const expenseDate = parseTrDate(dateText);
    if (totalKurus === null || personalKurus === null || restaurantKurus === null) {
      setError("Enter a valid total and personal amount.");
      return;
    }
    if (totalKurus <= 0) {
      setError("Enter the total buy amount.");
      return;
    }
    if (personalKurus < 0) {
      setError("Personal amount must not be negative.");
      return;
    }
    if (personalKurus > totalKurus) {
      setError("Personal amount cannot be more than the total.");
      return;
    }
    if (!expenseDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!note.trim()) {
      setError("Note is required.");
      return;
    }

    const needsExpenseAccount =
      (restaurantKurus > 0 && !selectedSupplierId) ||
      (personalKurus > 0 && Boolean(selectedSupplierId));
    if (needsExpenseAccount && !expenseAccountId) {
      setError("Select an expense account.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/partners/${partnerId}/split-buys`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_date: expenseDate,
            restaurant_amount_kurus: restaurantKurus,
            personal_amount_kurus: personalKurus,
            note: note.trim(),
            invoice_number: invoiceNumber.trim() || null,
            expense_account_id: needsExpenseAccount ? expenseAccountId : null,
            supplier_id: selectedSupplierId,
            actor_id: actorId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Split buy recorded");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const showExpenseAccount =
    amounts.restaurantKurus != null &&
    amounts.personalKurus != null &&
    ((amounts.restaurantKurus > 0 && !selectedSupplierId) ||
      (amounts.personalKurus > 0 && Boolean(selectedSupplierId)));

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Split buy"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter the ticket total and your personal share. Restaurant share is
          calculated automatically so the two amounts always add up.
        </p>
        <div>
          <Label htmlFor="sb-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="sb-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="sb-total">Total amount (TRY)</Label>
          <MoneyInput
            id="sb-total"
            value={totalText}
            onChange={setTotalText}
            required
          />
        </div>
        <div>
          <Label htmlFor="sb-personal">Personal amount (TRY)</Label>
          <MoneyInput
            id="sb-personal"
            value={personalText}
            onChange={setPersonalText}
          />
        </div>
        <div>
          <Label>Restaurant amount</Label>
          <p className="mt-1 text-sm tabular-nums">
            {amounts.restaurantKurus == null
              ? "—"
              : amounts.restaurantKurus < 0
                ? "Personal exceeds total"
                : formatTry(amounts.restaurantKurus)}
          </p>
        </div>
        <div>
          <Label htmlFor="sb-supplier">Supplier (optional)</Label>
          <Combobox
            id="sb-supplier"
            value={supplierId}
            onValueChange={setSupplierId}
            options={[
              { value: NO_SUPPLIER, label: "No supplier (pocket buy)" },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              })),
            ]}
            placeholder="No supplier…"
          />
        </div>
        {showExpenseAccount && (
          <div>
            <Label htmlFor="sb-account">Expense account</Label>
            <Combobox
              id="sb-account"
              value={expenseAccountId}
              onValueChange={setExpenseAccountId}
              options={expenseAccounts.map((a) => ({
                value: a.id,
                label: formatExpenseAccountLabel(a),
              }))}
              placeholder="Expense account…"
            />
          </div>
        )}
        <div>
          <Label htmlFor="sb-note">Note</Label>
          <Input
            id="sb-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            maxLength={512}
          />
        </div>
        <div>
          <Label htmlFor="sb-invoice">Invoice # (optional)</Label>
          <Input
            id="sb-invoice"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            maxLength={128}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record split buy"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
