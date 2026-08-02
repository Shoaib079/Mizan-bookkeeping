"use client";

/** Close day — post counted total + over/short, lock day, optional send. */

import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CashDenominationCounter } from "@/components/forms/cash-denomination-counter";
import {
  CashDrawerSplitPanel,
  type CashDrawerSplitResult,
} from "@/components/forms/cash-drawer-split-panel";
import { MainTillReference } from "@/components/forms/main-till-reference";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  formatTry,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  defaultCashAccountId?: string;
  defaultSessionDate?: string;
  onClosed?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
};

/** After a successful close — never dump back onto the close form. */
type Phase =
  | { kind: "form" }
  | {
      kind: "split";
      moneyAccountId: string;
      moneyAccountName: string;
      sessionDateDisplay: string;
    }
  | {
      kind: "done";
      moneyAccountName: string;
      leftKurus: number | null;
      sentKurus: number;
      destLabel: string | null;
    };

export function CashDrawerCloseDayForm({
  open,
  onClose,
  embedded = false,
  defaultCashAccountId: _ignoredCashAccountId,
  defaultSessionDate,
  onClosed,
  onDraftChange,
}: Props) {
  void _ignoredCashAccountId;
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
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
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

  if (!open) return null;

  let formBody: ReactNode;

  if (phase.kind === "split") {
    formBody = (
      <CashDrawerSplitPanel
        fromAccountId={phase.moneyAccountId}
        fromAccountName={phase.moneyAccountName}
        sessionDate={phase.sessionDateDisplay}
        cashAccounts={cashAccounts}
        onKeepHere={keepCashHere}
        onDone={finishAfterSend}
      />
    );
  } else if (phase.kind === "done") {
    const doneSummary =
      phase.sentKurus > 0 && phase.destLabel
        ? phase.leftKurus !== null
          ? `${phase.moneyAccountName} still has ${formatTry(phase.leftKurus)} (float) · sent ${formatTry(phase.sentKurus)} to ${phase.destLabel} — finished.`
          : `Sent ${formatTry(phase.sentKurus)} to ${phase.destLabel} — finished.`
        : phase.leftKurus !== null
          ? `Day closed. ${phase.moneyAccountName} still has ${formatTry(phase.leftKurus)} (counter float) — finished.`
          : `Day closed. Float stays in ${phase.moneyAccountName} — finished.`;
    formBody = (
      <div className="space-y-4" data-testid="cash-count-done">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium">All done</p>
          <p className="mt-1 text-sm text-muted-foreground">{doneSummary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={prepareFreshClose}>
            Close another day
          </Button>
          {!embedded && (
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  } else {
    formBody = (
      <form onSubmit={onSubmit} className="space-y-3" data-testid="close-day-form">
        {usingSavedCount && draftActive && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Using the count saved from Count cash — edit if needed, then post.
            </span>
            <Button type="button" variant="ghost" onClick={discardDraft}>
              Discard
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Posts the counted total and over/short for the <strong>Main</strong>{" "}
          till, then locks that drawer day. Next you can send part to Cash at
          home (reference balance above) and leave the rest as counter float in
          Main.
        </p>
        <div>
          <Label htmlFor="close-day-date">Session date (DD.MM.YYYY)</Label>
          <DateInput
            id="close-day-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <MainTillReference
          till={tillAccount}
          home={homeAccount}
          expectedKurus={expectedKurus}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">How are you counting?</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setUseNotes((v) => !v);
              if (useNotes) {
                setQuantities(emptyDenominationQuantities());
              }
            }}
          >
            {useNotes ? "Type total only" : "Count by notes"}
          </Button>
        </div>
        {useNotes && (
          <CashDenominationCounter
            quantities={quantities}
            onChange={setQuantities}
            onClear={() => {
              setQuantities(emptyDenominationQuantities());
              setCountedText("");
            }}
          />
        )}
        <div>
          <Label htmlFor="close-day-counted">Counted balance (TRY)</Label>
          <MoneyInput
            id="close-day-counted"
            placeholder="2.350,00"
            value={countedText}
            onChange={setCountedText}
            required
            disabled={useNotes && noteLines.length > 0}
          />
        </div>
        {overShortKurus !== null && (
          <div
            className={cn(
              "flex items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm",
              overShortKurus === 0 && "bg-success/10 text-success",
              overShortKurus > 0 && "bg-warning/10 text-warning",
              overShortKurus < 0 && "bg-destructive/10 text-destructive",
            )}
          >
            <span>
              {overShortKurus === 0
                ? "Drawer matches the books"
                : overShortKurus > 0
                  ? "Over — more cash than expected"
                  : "Short — less cash than expected"}
            </span>
            <span className="font-semibold tabular-nums">
              {overShortKurus > 0 ? "+" : ""}
              {formatTry(overShortKurus)}
            </span>
          </div>
        )}
        <div>
          <Label htmlFor="close-day-desc">Description</Label>
          <Input
            id="close-day-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {confirmWarning ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{confirmWarning}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setConfirmWarning(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submitClose(true)}
              >
                {submitting ? "Posting…" : "Post anyway"}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Closing…" : "Close day"}
          </Button>
        )}
      </form>
    );
  }

  const dialogTitle =
    phase.kind === "form"
      ? "Close day"
      : phase.kind === "done"
        ? "Day closed"
        : "Send part home";

  if (embedded) {
    return (
      <>
        {formBody}
        <PeriodUnlockDialog />
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        title={dialogTitle}
        onClose={onClose}
        size="default"
      >
        {formBody}
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
