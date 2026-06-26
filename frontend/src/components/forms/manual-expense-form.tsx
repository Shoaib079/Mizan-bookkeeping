"use client";

/** Manual expense dialog — autosave draft + discard confirm (DESIGN_SYSTEM §10, Slice 10.7). */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { type PartnerRow } from "@/components/forms/partner-form";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { statesDiffer, useFormDraft } from "@/lib/form-draft";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";

type MoneyAccount = { id: string; name: string };
type Account = { id: string; code: string; name: string };

const MANUAL_EXPENSE_ACCOUNT_CODES = ["5200", "5700"];

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
  /** Pre-select expense account by chart code (e.g. `5700` for cash tips). */
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
  const cashTipsOnly = defaultExpenseAccountCode === "5700";

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
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

  const draftFormKey =
    defaultExpenseAccountCode === "5700"
      ? "manual-expense:5700"
      : "manual-expense";

  const formDraft = useMemo<ExpenseFormDraft>(
    () => ({
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode: cashTipsOnly ? "cash" : paymentMode,
      itemName,
      amountText,
      dateText,
    }),
    [
      expenseAccountId,
      moneyAccountId,
      partnerId,
      paymentMode,
      cashTipsOnly,
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

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes, partnersRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      cashTipsOnly
        ? Promise.resolve({ items: [] as PartnerRow[] })
        : apiFetch<{ items: PartnerRow[] }>(
            `/entities/${entityId}/partners?limit=50`,
          ),
    ]);
    setCashAccounts(accountsRes.items);
    setPartners(
      partnersRes.items.filter((p) => p.is_active),
    );
    const pickable = chartRes.items.filter((a) =>
      MANUAL_EXPENSE_ACCOUNT_CODES.includes(a.code),
    );
    setExpenseAccounts(pickable);
    const preferred = defaultExpenseAccountCode
      ? pickable.find((a) => a.code === defaultExpenseAccountCode)
      : pickable.find((a) => a.code === "5200");
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
  }, [entityId, defaultExpenseAccountCode, cashTipsOnly]);

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
    void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

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
    setPaymentMode(cashTipsOnly ? "cash" : draft.paymentMode);
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
    const effectiveMode = cashTipsOnly ? "cash" : paymentMode;
    if (effectiveMode === "cash" && !moneyAccountId) {
      setError("Choose a cash drawer.");
      return;
    }
    if (effectiveMode === "partner" && !partnerId) {
      setError("Choose a partner.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const description = itemName || "Manual expense";
      if (effectiveMode === "partner") {
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
        cashTipsOnly
          ? "Cash tip expense saved"
          : effectiveMode === "partner"
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
      title={
        defaultExpenseAccountCode === "5700"
          ? "Cash tip expense"
          : "Manual expense"
      }
      onClose={onClose}
      dirty={dirty}
      onDiscard={handleDiscard}
    >
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
            onChange={(e) => setExpenseAccountId(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Use 5700 Tips Expense for cash tips paid from the drawer.
          </p>
        </div>
        {!cashTipsOnly && (
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
        )}
        {cashTipsOnly || paymentMode === "cash" ? (
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
