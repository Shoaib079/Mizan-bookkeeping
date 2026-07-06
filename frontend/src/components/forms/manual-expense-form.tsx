"use client";

/** Manual expense dialog — autosave draft + discard confirm (DESIGN_SYSTEM §10, Slice 10.7). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { ExpenseItemTypeahead } from "@/components/forms/expense-item-typeahead";
import { type EmployeeRow } from "@/components/forms/employee-form";
import { type PartnerRow } from "@/components/forms/partner-form";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { statesDiffer, useFormDraft } from "@/lib/form-draft";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import {
  clearConfirmItemOnTextEdit,
  type ExpenseItemSearchResult,
} from "@/lib/expense-item-search";
import {
  isSuggestedAccountActive,
  shouldApplyExpenseAccountSuggestion,
  type ExpenseAccountSuggestion,
} from "@/lib/expense-account-suggest";
import {
  ExpenseRecordKindToggle,
  type ExpenseRecordKind,
} from "@/components/expenses/expense-record-kind-toggle";

type MoneyAccount = { id: string; name: string };

type PaymentMode = "cash" | "partner";

type ExpenseFormDraft = {
  expenseAccountId: string;
  moneyAccountId: string;
  partnerId: string;
  paymentMode: PaymentMode;
  itemName: string;
  amountText: string;
  dateText: string;
};

function isExpenseDraftEmpty(draft: ExpenseFormDraft): boolean {
  return (
    !draft.itemName.trim() &&
    !draft.amountText.trim() &&
    !draft.dateText.trim()
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-select expense account by chart code (e.g. `5220`). */
  defaultExpenseAccountCode?: string;
  /** Cash drawer (default) or bank/card accounts for card retail spend. */
  paymentSource?: "cash" | "bank_card";
  title?: string;
  /** When set, opens in salary or expense mode (e.g. from Expenses page toggle). */
  defaultRecordKind?: ExpenseRecordKind;
  /** Hide in-dialog toggle when the Expenses page toggle controls mode. */
  showRecordKindToggle?: boolean;
  onSaved?: () => void;
};

export function ManualExpenseForm({
  open,
  onClose,
  defaultExpenseAccountCode,
  paymentSource = "cash",
  title = "Manual expense",
  defaultRecordKind = "expense",
  showRecordKindToggle = true,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

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
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [baseline, setBaseline] = useState<ExpenseFormDraft | null>(null);
  const [suggestedAccountId, setSuggestedAccountId] = useState<string | null>(null);
  const [suggestedSource, setSuggestedSource] = useState<string | null>(null);
  const userPickedAccountRef = useRef(false);

  const draftFormKey = defaultExpenseAccountCode
    ? `manual-expense:${recordKind}:${defaultExpenseAccountCode}:${paymentSource}`
    : `manual-expense:${recordKind}:${paymentSource}`;

  const formDraft = useMemo<ExpenseFormDraft>(
    () => ({
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode,
      itemName,
      amountText,
      dateText,
    }),
    [
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode,
      itemName,
      amountText,
      dateText,
    ],
  );

  const {
    resumeDraft,
    acceptResume,
    declineResume,
    clearDraft,
  } = useFormDraft({
    entityId,
    formKey: draftFormKey,
    value: formDraft,
    enabled: open && recordKind === "expense",
    isEmpty: isExpenseDraftEmpty,
  });

  const dirty =
    recordKind === "expense" &&
    baseline !== null &&
    statesDiffer(baseline, formDraft);

  useRegisterUnsaved("manual-expense", dirty, open && recordKind === "expense");

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const accountRequests =
      paymentSource === "bank_card"
        ? [
            apiFetch<{ items: MoneyAccount[] }>(
              `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
            ),
            apiFetch<{ items: MoneyAccount[] }>(
              `/entities/${entityId}/banking/accounts?account_kind=credit_card&limit=50`,
            ),
          ]
        : [
            apiFetch<{ items: MoneyAccount[] }>(
              `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
            ),
          ];
    const [accountsRes, chartRes, partnersRes, employeesRes] = await Promise.all([
      Promise.all(accountRequests).then((responses) => ({
        items: responses.flatMap((response) => response.items),
      })),
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
    // No lazy default (e.g. 5200): the category stays empty until the user
    // chooses or the AI/learned suggestion fills it — prevents everything
    // silently landing in "General Expense". Only honor an explicit prop.
    const preferred = defaultExpenseAccountCode
      ? findExpenseAccountByCode(chartRes.items, defaultExpenseAccountCode)
      : undefined;
    if (preferred) setExpenseAccountId(preferred.id);
    if (paymentSource === "bank_card") {
      if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
    } else {
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
    }
    const activePartners = partnersRes.items.filter((p) => p.is_active);
    if (activePartners[0]) setPartnerId(activePartners[0].id);
    setOptionsLoaded(true);
  }, [entityId, defaultExpenseAccountCode, paymentSource]);

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

  const allowSalaryMode =
    showRecordKindToggle && !defaultExpenseAccountCode && paymentSource === "cash";

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
    setDateText(todayTrDate());
    setPaymentMode("cash");
    setPartnerId("");
    setBaseline(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Set an entity ID in the sidebar first.");
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
    if (paymentSource === "cash" && paymentMode === "cash" && !moneyAccountId) {
      setError("Choose a cash drawer.");
      return;
    }
    if (paymentSource === "bank_card" && !moneyAccountId) {
      setError("Choose a bank or card account.");
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
      const description = itemName || "Manual expense";
      if (paymentMode === "partner") {
        await apiFetch(
          `/entities/${entityId}/partners/${partnerId}/expenses-fronted`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expense_date: expenseDate,
              amount_kurus: amountKurus,
              description,
              actor_id: actorId,
              expense_account_id: expenseAccountId,
            }),
          },
        );
      } else {
        await apiFetch(`/entities/${entityId}/expenses`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_date: expenseDate,
            amount_kurus: amountKurus,
            expense_account_id: expenseAccountId,
            money_account_id: moneyAccountId,
            written_item_description: itemName || null,
            has_source_document: false,
            description,
            actor_id: actorId,
            confirm_expense_item_id: confirmExpenseItemId,
          }),
        });
      }
      submitIdempotency.completeSubmit();
      clearDraft();
      onSaved?.();
      toast(
        paymentMode === "partner"
          ? "Partner expense recorded"
          : "Expense saved",
      );
      // Keep the dialog open so the owner can add another expense; reset for a
      // fresh entry and clear the category so it must be chosen again. The
      // owner closes the dialog themselves.
      setItemName("");
      setConfirmExpenseItemId(null);
      pickedItemCanonicalRef.current = null;
      setAmountText("");
      setExpenseAccountId("");
      setSuggestedAccountId(null);
      setSuggestedSource(null);
      userPickedAccountRef.current = false;
      setBaseline({
        expenseAccountId: "",
        moneyAccountId,
        partnerId,
        paymentMode,
        itemName: "",
        amountText: "",
        dateText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const dialogTitle =
    recordKind === "salary" ? "Record salary payment" : title;

  return (
    <Dialog
      open={open}
      title={dialogTitle}
      onClose={onClose}
      dirty={recordKind === "expense" ? dirty : false}
      onDiscard={recordKind === "expense" ? handleDiscard : undefined}
    >
      <RecordingForBanner />
      {recordKind === "expense" && resumeDraft && (
        <ResumeDraftBanner
          onResume={handleResume}
          onDismiss={handleDeclineResume}
        />
      )}
      {allowSalaryMode && (
        <ExpenseRecordKindToggle
          value={recordKind}
          onChange={setRecordKind}
          className="mb-4"
        />
      )}

      {recordKind === "salary" ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Posts through staff salary payable (same as Staff → Pay salary). Pick
            the salary month separately from the payment date.
          </p>
          <div className="mb-3">
            <Label htmlFor="exp-salary-date">Date (DD.MM.YYYY)</Label>
            <DateInput
              id="exp-salary-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <div className="mb-3">
            <Label htmlFor="exp-salary-employee">Employee</Label>
            <Combobox
              id="exp-salary-employee"
              value={employeeId}
              onValueChange={setEmployeeId}
              options={employees.map((e) => ({
                value: e.id,
                label: e.name,
              }))}
              placeholder="Choose employee…"
            />
          </div>
          {entityId && selectedEmployee && (
            <StaffSalaryPaymentDialog
              embedded
              open
              entityId={entityId}
              employeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              payCurrency={selectedEmployee.pay_currency}
              source="staff"
              hidePaymentDate
              paymentDate={parseTrDate(dateText) ?? undefined}
              closeOnSuccess={false}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
        </>
      ) : (
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="exp-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="exp-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <ExpenseItemTypeahead
          entityId={entityId}
          value={itemName}
          onValueChange={handleItemNameChange}
          onPickItem={handlePickExpenseItem}
          disabled={submitting}
        />
        <div>
          <Label htmlFor="exp-amount">Amount (TRY)</Label>
          <MoneyInput
            id="exp-amount"
            placeholder="150,00"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="exp-account">Expense account</Label>
            {entityId && (
              <AddExpenseCategoryButton
                entityId={entityId}
                onCreated={async (account) => {
                  setExpenseAccounts((prev) => mergeExpenseAccounts(prev, account));
                  setExpenseAccountId(account.id);
                  userPickedAccountRef.current = true;
                  setSuggestedAccountId(null);
                  setSuggestedSource(null);
                }}
              />
            )}
          </div>
          <Select
            id="exp-account"
            value={expenseAccountId}
            onChange={(e) => {
              userPickedAccountRef.current = true;
              setExpenseAccountId(e.target.value);
              setSuggestedAccountId(null);
              setSuggestedSource(null);
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
              {suggestedSource === "ai" ? " (AI)" : suggestedSource === "learned" ? " (learned)" : ""}
              {" — you can change it before saving."}
            </p>
          )}
        </div>
        <div>
          {paymentSource === "bank_card" ? (
            <div>
              <Label htmlFor="exp-bank">Bank or card account</Label>
              <Combobox
                id="exp-bank"
                value={moneyAccountId}
                onValueChange={setMoneyAccountId}
                options={cashAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
                placeholder="Bank or card…"
              />
            </div>
          ) : (
            <>
              <Label htmlFor="exp-payment">Payment</Label>
              <Select
                id="exp-payment"
                value={paymentMode}
                onChange={(e) =>
                  setPaymentMode(e.target.value as PaymentMode)
                }
              >
                <option value="cash">Cash drawer</option>
                <option value="partner">Partner paid (owe partner)</option>
              </Select>
            </>
          )}
        </div>
        {paymentSource === "cash" && paymentMode === "cash" ? (
          <div>
            <Label htmlFor="exp-cash">Cash drawer</Label>
            <Combobox
              id="exp-cash"
              value={moneyAccountId}
              onValueChange={setMoneyAccountId}
              options={cashAccounts.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              placeholder="Cash drawer…"
            />
          </div>
        ) : paymentSource === "cash" && paymentMode === "partner" ? (
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
        ) : null}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </Button>
      </form>
      )}
    </Dialog>
  );
}
