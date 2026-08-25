"use client";

/** Load, select, and submit for SplitHubPage. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { GENERAL_EXPENSE_CODE } from "@/lib/account-codes";
import { parseTryToKurus } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

import type {
  ExpenseCandidate,
  PaymentCandidate,
  PartnerRow,
  Selected,
  SourceTab,
} from "@/components/split/split-hub-types";

export function useSplitHubPage() {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [tab, setTab] = useState<SourceTab>("bank_expense");
  const [expenses, setExpenses] = useState<ExpenseCandidate[]>([]);
  const [payments, setPayments] = useState<PaymentCandidate[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [partnerId, setPartnerId] = useState("");
  const [personalText, setPersonalText] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setSelected(null);
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
  }, []);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const q = search.trim()
        ? `&q=${encodeURIComponent(search.trim())}`
        : "";
      const [expenseList, paymentList, partnerList, chart] = await Promise.all([
        apiFetch<{ items: ExpenseCandidate[] }>(
          `/entities/${entityId}/splits/bank-expenses?limit=50${q}`,
        ),
        apiFetch<{ items: PaymentCandidate[] }>(
          `/entities/${entityId}/splits/supplier-payments?limit=50${q}`,
        ),
        apiFetch<{ items: PartnerRow[] }>(
          `/entities/${entityId}/partners?limit=200`,
        ),
        apiFetch<{ items: ChartAccount[] }>(
          `/entities/${entityId}/chart-of-accounts?limit=200`,
        ),
      ]);
      setExpenses(expenseList.items);
      setPayments(paymentList.items);
      setPartners(partnerList.items.filter((p) => p.is_active !== false));
      const filtered = filterExpenseAccounts(chart.items);
      setExpenseAccounts(filtered);
      const general = findExpenseAccountByCode(chart.items, GENERAL_EXPENSE_CODE);
      if (general) setExpenseAccountId(general.id);
      else if (filtered[0]) setExpenseAccountId(filtered[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedExpense = useMemo(() => {
    if (!selected || selected.kind !== "bank_expense") return null;
    return expenses.find((row) => row.expense_id === selected.id) ?? null;
  }, [expenses, selected]);

  const selectedPayment = useMemo(() => {
    if (!selected || selected.kind !== "supplier_payment") return null;
    return (
      payments.find((row) => row.supplier_ledger_entry_id === selected.id) ??
      null
    );
  }, [payments, selected]);

  useEffect(() => {
    if (selected?.kind === "bank_expense" && !selectedExpense) closeDialog();
    if (selected?.kind === "supplier_payment" && !selectedPayment) closeDialog();
  }, [selected, selectedExpense, selectedPayment, closeDialog]);

  const remaining =
    selectedExpense?.remaining_splittable_kurus ??
    selectedPayment?.remaining_splittable_kurus ??
    null;
  const personalKurus = parseTryToKurus(personalText || "0");
  const restaurantKurus =
    remaining != null && personalKurus !== null
      ? remaining - personalKurus
      : null;

  function openExpense(id: string) {
    setSelected({ kind: "bank_expense", id });
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
    submitIdempotency.resetSubmit();
  }

  function openPayment(id: string) {
    setSelected({ kind: "supplier_payment", id });
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
    submitIdempotency.resetSubmit();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !selected) {
      setFormError("Pick something to split.");
      return;
    }
    if (!partnerId) {
      setFormError("Select a partner.");
      return;
    }
    if (personalKurus === null || personalKurus <= 0) {
      setFormError("Enter a personal amount greater than zero.");
      return;
    }
    if (remaining == null || personalKurus > remaining) {
      setFormError("Personal amount cannot exceed the remaining total.");
      return;
    }
    if (!note.trim()) {
      setFormError("Note is required.");
      return;
    }
    if (selected.kind === "supplier_payment" && !expenseAccountId) {
      setFormError("Select an expense account to reverse the personal share.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      if (selected.kind === "bank_expense") {
        await apiFetch(`/entities/${entityId}/splits/bank-expenses`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_id: selected.id,
            partner_id: partnerId,
            personal_amount_kurus: personalKurus,
            note: note.trim(),
            actor_id: actorId,
          }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/splits/supplier-payments`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_ledger_entry_id: selected.id,
            partner_id: partnerId,
            personal_amount_kurus: personalKurus,
            expense_account_id: expenseAccountId,
            note: note.trim(),
            actor_id: actorId,
          }),
        });
      }
      submitIdempotency.completeSubmit();
      toast("Split recorded");
      closeDialog();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const dialogTitle =
    selected?.kind === "supplier_payment"
      ? "Split supplier payment"
      : "Split bank expense";

  return {
    entityId,
    tab,
    setTab,
    expenses,
    payments,
    partners,
    expenseAccounts,
    expenseAccountId,
    setExpenseAccountId,
    loading,
    error,
    search,
    setSearch,
    selected,
    partnerId,
    setPartnerId,
    personalText,
    setPersonalText,
    note,
    setNote,
    submitting,
    formError,
    closeDialog,
    selectedExpense,
    selectedPayment,
    remaining,
    restaurantKurus,
    openExpense,
    openPayment,
    onSubmit,
    dialogTitle,
  };
}
