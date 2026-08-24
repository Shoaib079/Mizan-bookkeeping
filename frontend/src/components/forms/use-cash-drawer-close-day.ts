"use client";

/** State, draft, load/Main lock, and close submit for CashDrawerCloseDayForm. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { type CashDrawerSplitResult } from "@/components/forms/cash-drawer-split-panel";
import type { CashCloseDayPhase } from "@/components/forms/cash-close-day-types";
import { ApiError, apiFetch } from "@/lib/api";
import {
  CASH_COUNT_DRAFT_FORM_KEY,
  type CashCountDraft,
  emptyCashCountDraft,
  hasCashCountDraft,
  isCashCountDraftEmpty,
  normalizeDraftQuantities,
  quantitiesToDraft,
} from "@/lib/cash-count-draft";
import {
  emptyDenominationQuantities,
  denominationTotalKurus,
  denominationLinesFromQuantities,
} from "@/lib/cash-denominations";
import { useFormDraft } from "@/lib/form-draft";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  cashHomeReferenceAccount,
  mainTillAccount,
} from "@/lib/load-money-accounts";
import {
  formatKurus,
  formatTrDate,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

export type UseCashDrawerCloseDayArgs = {
  open: boolean;
  defaultSessionDate?: string;
  onClosed?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
};

export function useCashDrawerCloseDay({
  open,
  defaultSessionDate,
  onClosed,
  onDraftChange,
}: UseCashDrawerCloseDayArgs) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } =
    usePeriodUnlockSubmit();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [countedText, setCountedText] = useState("");
  const [quantities, setQuantities] = useState(emptyDenominationQuantities);
  const [useNotes, setUseNotes] = useState(true);
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);
  const [phase, setPhase] = useState<CashCloseDayPhase>({ kind: "form" });
  const [usingSavedCount, setUsingSavedCount] = useState(false);

  const onForm = phase.kind === "form";

  const draftSnapshot = useMemo<CashCountDraft>(
    () => ({
      moneyAccountId,
      dateText,
      countedText,
      quantities: quantitiesToDraft(quantities),
      useNotes,
      description,
    }),
    [moneyAccountId, dateText, countedText, quantities, useNotes, description],
  );

  const { resumeDraft, storageReady, acceptResume, clearDraft } = useFormDraft({
    entityId,
    formKey: CASH_COUNT_DRAFT_FORM_KEY,
    value: draftSnapshot,
    enabled: open && onForm,
    isEmpty: isCashCountDraftEmpty,
  });

  const applyDraft = useCallback((draft: CashCountDraft) => {
    // Money account is always forced to Main till after accounts load.
    setDateText(draft.dateText);
    setCountedText(draft.countedText);
    setQuantities(normalizeDraftQuantities(draft.quantities));
    setUseNotes(draft.useNotes);
    setDescription(draft.description || "Cash drawer EOD close");
  }, []);

  const resetCountFields = useCallback(() => {
    const empty = emptyCashCountDraft();
    setCountedText(empty.countedText);
    setQuantities(emptyDenominationQuantities());
    setUseNotes(true);
    setDescription(empty.description);
  }, []);

  const prepareFreshClose = useCallback(() => {
    resetCountFields();
    setDateText(todayTrDate());
    setError(null);
    setConfirmWarning(null);
    setUsingSavedCount(false);
    setPhase({ kind: "form" });
    submitIdempotency.resetSubmit();
  }, [resetCountFields, submitIdempotency]);

  useEffect(() => {
    if (!open || !resumeDraft || !onForm) return;
    applyDraft(acceptResume() ?? resumeDraft);
    setUsingSavedCount(true);
  }, [open, resumeDraft, acceptResume, applyDraft, onForm]);

  useEffect(() => {
    if (!open) return;
    submitIdempotency.resetSubmit();
    setPhase({ kind: "form" });
    setConfirmWarning(null);
    setError(null);
    setUsingSavedCount(hasCashCountDraft(entityId));
  }, [open, submitIdempotency, entityId]);

  useEffect(() => {
    setCashAccounts([]);
    setMoneyAccountId("");
    setPhase({ kind: "form" });
    setConfirmWarning(null);
    setError(null);
    resetCountFields();
    setDateText("");
    setUsingSavedCount(false);
  }, [entityId, resetCountFields]);

  const loadAccounts = useCallback(async (): Promise<MoneyAccountLeaf[]> => {
    if (!entityId) return [];
    const cashRes = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    const active = cashRes.items.filter((a) => a.is_active);
    setCashAccounts(active);
    const till = mainTillAccount(active);
    setMoneyAccountId(till?.id ?? "");
    return active;
  }, [entityId]);

  // Keep selection locked to Main even if a draft or prop pointed at home.
  useEffect(() => {
    const till = mainTillAccount(cashAccounts);
    if (till && moneyAccountId !== till.id) {
      setMoneyAccountId(till.id);
    }
  }, [cashAccounts, moneyAccountId]);

  useEffect(() => {
    if (!open) return;
    void loadAccounts().catch(() => undefined);
  }, [open, loadAccounts]);

  useEffect(() => {
    if (!open || !storageReady || dateText || !onForm) return;
    if (resumeDraft) return;
    const initial = defaultSessionDate
      ? defaultSessionDate.includes("-")
        ? formatTrDate(defaultSessionDate)
        : defaultSessionDate
      : todayTrDate();
    setDateText(initial);
  }, [
    open,
    storageReady,
    dateText,
    resumeDraft,
    defaultSessionDate,
    onForm,
  ]);

  const tillAccount = mainTillAccount(cashAccounts);
  const homeAccount = cashHomeReferenceAccount(cashAccounts);
  const selectedAccount = tillAccount;
  const expectedKurus = selectedAccount?.balance_kurus ?? null;
  const noteLines = denominationLinesFromQuantities(quantities);
  const notesTotal = denominationTotalKurus(noteLines);
  const draftActive = !isCashCountDraftEmpty(draftSnapshot);

  useEffect(() => {
    onDraftChange?.(draftActive && open && onForm);
  }, [draftActive, open, onForm, onDraftChange]);

  useEffect(() => {
    if (useNotes && noteLines.length > 0) {
      setCountedText(formatKurus(notesTotal));
    }
  }, [useNotes, notesTotal, noteLines.length]);

  const countedPreviewKurus = parseTryToKurus(countedText);
  const overShortKurus =
    expectedKurus !== null && countedPreviewKurus !== null
      ? countedPreviewKurus - expectedKurus
      : null;

  async function submitClose(confirmLargeVariance: boolean) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const countedKurus = parseTryToKurus(countedText);
    const sessionDate = parseTrDate(dateText);
    if (countedKurus === null || countedKurus < 0) {
      setError("Enter a valid counted balance.");
      return;
    }
    if (!sessionDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (useNotes && noteLines.length > 0 && notesTotal !== countedKurus) {
      setError("Notes total must match counted balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) => {
        await apiFetch(`/entities/${entityId}/cash/drawer-sessions/close-day`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            withPeriodUnlockReason(
              {
                money_account_id: moneyAccountId,
                session_date: sessionDate,
                counted_balance_kurus: countedKurus,
                actor_id: actorId || undefined,
                description,
                confirm_large_variance: confirmLargeVariance,
              },
              periodUnlockReason,
            ),
          ),
        });
      });
      submitIdempotency.completeSubmit();
      setConfirmWarning(null);
      clearDraft();
      resetCountFields();
      setUsingSavedCount(false);
      onDraftChange?.(false);
      const refreshed = await loadAccounts();
      const fromId = moneyAccountId;
      const fromName = selectedAccount?.name ?? "Cash drawer";
      const others = (refreshed ?? []).filter(
        (a) => a.id !== fromId && a.is_active,
      );
      if (others.length > 0) {
        setPhase({
          kind: "split",
          moneyAccountId: fromId,
          moneyAccountName: fromName,
          sessionDateDisplay: dateText,
        });
      } else {
        const bal =
          (refreshed ?? []).find((a) => a.id === fromId)?.balance_kurus ?? null;
        setPhase({
          kind: "done",
          moneyAccountName: fromName,
          leftKurus: bal,
          sentKurus: 0,
          destLabel: null,
        });
      }
      onClosed?.();
      toast("Day closed — over/short posted");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        submitIdempotency.resetSubmit();
        setConfirmWarning(err.message);
      } else {
        setConfirmWarning(null);
        setError(err instanceof Error ? err.message : "Close failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitClose(false);
  }

  function keepCashHere() {
    if (phase.kind !== "split") return;
    const name = phase.moneyAccountName;
    const bal =
      cashAccounts.find((a) => a.id === phase.moneyAccountId)?.balance_kurus ??
      null;
    setPhase({
      kind: "done",
      moneyAccountName: name,
      leftKurus: bal,
      sentKurus: 0,
      destLabel: null,
    });
    toast(`Float left in ${name}`);
  }

  function finishAfterSend(result: CashDrawerSplitResult) {
    setPhase({
      kind: "done",
      moneyAccountName: result.fromName,
      leftKurus: result.leftKurus,
      sentKurus: result.sentKurus,
      destLabel: result.destLabel,
    });
    void loadAccounts().catch(() => undefined);
  }

  function discardDraft() {
    clearDraft();
    resetCountFields();
    setDateText(todayTrDate());
    setError(null);
    setConfirmWarning(null);
    setUsingSavedCount(false);
    onDraftChange?.(false);
  }

  function toggleUseNotes() {
    setUseNotes((v) => !v);
    if (useNotes) {
      setQuantities(emptyDenominationQuantities());
    }
  }

  function clearDenominations() {
    setQuantities(emptyDenominationQuantities());
    setCountedText("");
  }

  return {
    PeriodUnlockDialog,
    cashAccounts,
    phase,
    dateText,
    setDateText,
    countedText,
    setCountedText,
    quantities,
    setQuantities,
    useNotes,
    description,
    setDescription,
    error,
    submitting,
    confirmWarning,
    setConfirmWarning,
    usingSavedCount,
    draftActive,
    tillAccount,
    homeAccount,
    expectedKurus,
    noteLines,
    overShortKurus,
    submitClose,
    onSubmit,
    keepCashHere,
    finishAfterSend,
    discardDraft,
    prepareFreshClose,
    toggleUseNotes,
    clearDenominations,
  };
}
