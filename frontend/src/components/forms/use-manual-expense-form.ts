"use client";

/** State + load/suggest/draft/submit for ManualExpenseForm (file-size split). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type EmployeeRow } from "@/components/forms/employee-form";
import { type PartnerRow } from "@/components/forms/partner-form";
import { type ExpenseRecordKind } from "@/components/expenses/expense-record-kind-toggle";
import { apiFetch } from "@/lib/api";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { statesDiffer, useFormDraft } from "@/lib/form-draft";
import {
  isExpenseDraftEmpty,
  type ExpenseFormDraft,
  type MoneyAccount,
  type PaymentMode,
} from "@/lib/manual-expense-draft";
import {
  manualExpenseSuccessToast,
  submitManualExpense,
} from "@/lib/manual-expense-submit";
import { defaultMainDrawerId, shouldShowCashDrawerPicker } from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useFormTouched } from "@/lib/use-form-dirty";
import {
  clearConfirmItemOnTextEdit,
  type ExpenseItemSearchResult,
} from "@/lib/expense-item-search";
import {
  shouldApplyExpenseAccountSuggestion,
  type ExpenseAccountSuggestion,
} from "@/lib/expense-account-suggest";

export function useManualExpenseForm(args: {
  open: boolean;
  defaultRecordKind: ExpenseRecordKind;
  onSaved?: () => void;
}) {
  const { open, defaultRecordKind, onSaved } = args;
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [recordKind, setRecordKind] = useState<ExpenseRecordKind>(defaultRecordKind);
  const [employeeId, setEmployeeId] = useState("");
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [itemName, setItemName] = useState("");
  const [confirmExpenseItemId, setConfirmExpenseItemId] = useState<string | null>(
    null,
  );
  const pickedItemCanonicalRef = useRef<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [notes, setNotes] = useState("");
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [baseline, setBaseline] = useState<ExpenseFormDraft | null>(null);
  const [suggestedAccountId, setSuggestedAccountId] = useState<string | null>(null);
  const [suggestedSource, setSuggestedSource] = useState<string | null>(null);
  const userPickedAccountRef = useRef(false);

  const draftFormKey = `manual-expense:${recordKind}`;

  const formDraft = useMemo<ExpenseFormDraft>(
    () => ({
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode,
      itemName,
      amountText,
      dateText,
      notes,
    }),
    [
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode,
      itemName,
      amountText,
      dateText,
      notes,
    ],
  );

  const { resumeDraft, acceptResume, declineResume, clearDraft } = useFormDraft({
    entityId,
    formKey: draftFormKey,
    value: formDraft,
    enabled: open && recordKind === "expense",
    isEmpty: isExpenseDraftEmpty,
  });

  const { touched, markTouched } = useFormTouched(open && recordKind === "expense");

  const dirty =
    recordKind === "expense" &&
    touched &&
    baseline !== null &&
    statesDiffer(baseline, formDraft);

  useRegisterUnsaved("manual-expense", dirty, open && recordKind === "expense");

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes, partnersRes, employeesRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: PartnerRow[] }>(
        `/entities/${entityId}/partners?limit=50`,
      ),
      apiFetch<{ items: EmployeeRow[] }>(
        `/entities/${entityId}/staff/employees?include_inactive=false&limit=100`,
      ),
    ]);
    setCashAccounts(accountsRes.items);
    setPartners(partnersRes.items.filter((p) => p.is_active));
    const activeEmployees = employeesRes.items.filter((e) => e.is_active);
    setEmployees(activeEmployees);
    if (activeEmployees[0]) setEmployeeId(activeEmployees[0].id);
    const pickable = filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(pickable);
    const drawerId = defaultMainDrawerId(
      accountsRes.items.map((a) => ({
        id: a.id,
        gl_account_id: "",
        name: a.name,
        account_kind: "cash",
      })),
    );
    if (drawerId) setMoneyAccountId(drawerId);
    else if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
    const activePartners = partnersRes.items.filter((p) => p.is_active);
    if (activePartners[0]) setPartnerId(activePartners[0].id);
    setOptionsLoaded(true);
  }, [entityId]);

  useEffect(() => {
    if (!open) {
      setOptionsLoaded(false);
      setBaseline(null);
      return;
    }
    setDateText(todayTrDate());
    setItemName("");
    setConfirmExpenseItemId(null);
    pickedItemCanonicalRef.current = null;
    setExpenseAccountId("");
    setAmountText("");
    setNotes("");
    setPaymentMode("cash");
    setPartnerId("");
    setRecordKind(defaultRecordKind);
    setEmployeeId("");
    setError(null);
    userPickedAccountRef.current = false;
    setSuggestedAccountId(null);
    setSuggestedSource(null);
    void loadOptions().catch(() => undefined);
  }, [open, loadOptions, defaultRecordKind]);

  useEffect(() => {
    if (!open || !entityId || itemName.trim().length < 2) {
      setSuggestedAccountId(null);
      setSuggestedSource(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const suggestion = await apiFetch<ExpenseAccountSuggestion>(
            `/entities/${entityId}/expenses/suggest-account?description=${encodeURIComponent(itemName.trim())}`,
          );
          const nextId = shouldApplyExpenseAccountSuggestion(
            suggestion.account_id
              ? {
                  account_id: suggestion.account_id,
                  source: (suggestion.source ?? "learned") as "learned" | "ai",
                  confidence: suggestion.confidence ?? "medium",
                }
              : null,
            expenseAccountId,
            userPickedAccountRef.current,
          );
          if (nextId) {
            setExpenseAccountId(nextId);
            setSuggestedAccountId(nextId);
            setSuggestedSource(suggestion.source ?? null);
          } else if (suggestion.account_id) {
            setSuggestedAccountId(suggestion.account_id);
            setSuggestedSource(suggestion.source ?? null);
          } else {
            setSuggestedAccountId(null);
            setSuggestedSource(null);
          }
        } catch {
          setSuggestedAccountId(null);
          setSuggestedSource(null);
        }
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, entityId, itemName, expenseAccountId]);

  useEffect(() => {
    if (!open || !optionsLoaded || baseline !== null || resumeDraft !== null) {
      return;
    }
    setBaseline(formDraft);
  }, [open, optionsLoaded, baseline, resumeDraft, formDraft]);

  function handleItemNameChange(next: string) {
    if (
      clearConfirmItemOnTextEdit(
        confirmExpenseItemId,
        pickedItemCanonicalRef.current,
        next,
      )
    ) {
      setConfirmExpenseItemId(null);
      pickedItemCanonicalRef.current = null;
    }
    setItemName(next);
  }

  function handlePickExpenseItem(item: ExpenseItemSearchResult) {
    setItemName(item.canonical_name);
    setConfirmExpenseItemId(item.id);
    pickedItemCanonicalRef.current = item.canonical_name;
    if (item.default_expense_account_id) {
      setExpenseAccountId(item.default_expense_account_id);
      setSuggestedAccountId(null);
      setSuggestedSource(null);
    }
  }

  function applyDraft(draft: ExpenseFormDraft) {
    setExpenseAccountId(draft.expenseAccountId);
    setMoneyAccountId(draft.moneyAccountId);
    setPartnerId(draft.partnerId);
    setPaymentMode(draft.paymentMode);
    setItemName(draft.itemName);
    setAmountText(draft.amountText);
    setDateText(draft.dateText);
    setNotes(draft.notes);
  }

  function handleResume() {
    const draft = acceptResume();
    if (!draft) return;
    applyDraft(draft);
    setBaseline(draft);
  }

  function handleDeclineResume() {
    declineResume();
    setBaseline(formDraft);
  }

  function handleDiscard() {
    clearDraft();
    setItemName("");
    setConfirmExpenseItemId(null);
    pickedItemCanonicalRef.current = null;
    setAmountText("");
    setNotes("");
    setDateText(todayTrDate());
    setPaymentMode("cash");
    setPartnerId("");
    setBaseline(null);
  }

  function markAccountPickedByUser() {
    userPickedAccountRef.current = true;
    setSuggestedAccountId(null);
    setSuggestedSource(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const expenseDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!expenseDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!expenseAccountId) {
      setError("Choose an expense account.");
      return;
    }
    if (paymentMode === "cash" && !moneyAccountId) {
      setError("Choose a cash drawer.");
      return;
    }
    if (paymentMode === "partner" && !partnerId) {
      setError("Choose a partner.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithDuplicateGuard(async (acknowledgedDuplicate) => {
        await submitManualExpense({
          entityId,
          actorId,
          paymentMode,
          partnerId,
          moneyAccountId,
          expenseAccountId,
          expenseDate,
          amountKurus,
          itemName,
          notes,
          confirmExpenseItemId,
          idempotencyKey,
          acknowledgedDuplicate,
        });
      });
      submitIdempotency.completeSubmit();
      clearDraft();
      onSaved?.();
      toast(manualExpenseSuccessToast(paymentMode));
      // Keep dialog open for another expense; clear category so it is chosen again.
      setItemName("");
      setConfirmExpenseItemId(null);
      pickedItemCanonicalRef.current = null;
      setAmountText("");
      setNotes("");
      setExpenseAccountId("");
      setSuggestedAccountId(null);
      setSuggestedSource(null);
      userPickedAccountRef.current = false;
      setBaseline({
        expenseAccountId: "", moneyAccountId, partnerId, paymentMode,
        itemName: "", amountText: "", dateText, notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const showCashDrawerPicker =
    paymentMode === "cash" && shouldShowCashDrawerPicker(cashAccounts);

  return {
    entityId, cashAccounts, partners, employees, recordKind, setRecordKind,
    employeeId, setEmployeeId, expenseAccounts, setExpenseAccounts,
    expenseAccountId, setExpenseAccountId, moneyAccountId, setMoneyAccountId,
    partnerId, setPartnerId, paymentMode, setPaymentMode, itemName,
    confirmExpenseItemId, amountText, setAmountText, notes, setNotes,
    dateText, setDateText, error, submitting, resumeDraft, suggestedAccountId,
    suggestedSource, dirty, selectedEmployee, showCashDrawerPicker, markTouched,
    handleItemNameChange, handlePickExpenseItem, handleResume,
    handleDeclineResume, handleDiscard, markAccountPickedByUser, onSubmit,
    DuplicateRecordDialog,
  };
}
