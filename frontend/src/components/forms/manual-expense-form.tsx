"use client";

/** Manual expense dialog — autosave draft + discard confirm (DESIGN_SYSTEM §10, Slice 10.7). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { type PartnerRow } from "@/components/forms/partner-form";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { statesDiffer, useFormDraft } from "@/lib/form-draft";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import {
  isSuggestedAccountActive,
  shouldApplyExpenseAccountSuggestion,
  type ExpenseAccountSuggestion,
} from "@/lib/expense-account-suggest";

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
  /** Pre-select expense account by chart code (e.g. `5200`). */
  defaultExpenseAccountCode?: string;
};

export function ManualExpenseForm({
  open,
  onClose,
  defaultExpenseAccountCode,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [itemName, setItemName] = useState("");
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
    ? `manual-expense:${defaultExpenseAccountCode}`
    : "manual-expense";

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
    enabled: open,
    isEmpty: isExpenseDraftEmpty,
  });

  const dirty =
    baseline !== null && statesDiffer(baseline, formDraft);

  useRegisterUnsaved("manual-expense", dirty, open);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes, partnersRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: PartnerRow[] }>(
        `/entities/${entityId}/partners?limit=50`,
      ),
    ]);
    setCashAccounts(accountsRes.items);
    setPartners(partnersRes.items.filter((p) => p.is_active));
    const pickable = filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(pickable);
    const preferred = defaultExpenseAccountCode
      ? findExpenseAccountByCode(chartRes.items, defaultExpenseAccountCode)
      : findExpenseAccountByCode(chartRes.items, "5200");
    if (preferred) setExpenseAccountId(preferred.id);
    else if (pickable[0]) setExpenseAccountId(pickable[0].id);
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
  }, [entityId, defaultExpenseAccountCode]);

  useEffect(() => {
    if (!open) {
      setOptionsLoaded(false);
      setBaseline(null);
      return;
    }
    setDateText(todayTrDate());
    setItemName("");
    setAmountText("");
    setPaymentMode("cash");
    setPartnerId("");
    setError(null);
    userPickedAccountRef.current = false;
    setSuggestedAccountId(null);
    setSuggestedSource(null);
    void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

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
          }),
        });
      }
      submitIdempotency.completeSubmit();
      clearDraft();
      setBaseline(null);
      onClose();
      toast(
        paymentMode === "partner"
          ? "Partner expense recorded"
          : "Expense saved",
      );
      setItemName("");
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Manual expense"
      onClose={onClose}
      dirty={dirty}
      onDiscard={handleDiscard}
    >
      <RecordingForBanner />
      {resumeDraft && (
        <ResumeDraftBanner
          onResume={handleResume}
          onDismiss={handleDeclineResume}
        />
      )}
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
        <div>
          <Label htmlFor="exp-item">Item name</Label>
          <Input
            id="exp-item"
            placeholder="peynir"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="exp-account">Expense account</Label>
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
        </div>
        {paymentMode === "cash" ? (
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
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </Dialog>
  );
}
