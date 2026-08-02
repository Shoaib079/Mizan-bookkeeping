"use client";

/** Count cash — note calculator + sticky draft only. Does not post or lock. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { CashDenominationCounter } from "@/components/forms/cash-denomination-counter";
import { MainTillReference } from "@/components/forms/main-till-reference";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import {
  CASH_COUNT_DRAFT_FORM_KEY,
  type CashCountDraft,
  emptyCashCountDraft,
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
  /** Switch Record desk to Close day (draft stays). */
  onContinueToCloseDay?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
};

export function CashCountForm({
  open,
  onClose,
  embedded = false,
  defaultCashAccountId: _ignoredCashAccountId,
  defaultSessionDate,
  onContinueToCloseDay,
  onDraftChange,
}: Props) {
  void _ignoredCashAccountId;
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [countedText, setCountedText] = useState("");
  const [quantities, setQuantities] = useState(emptyDenominationQuantities);
  const [useNotes, setUseNotes] = useState(true);
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [hydrated, setHydrated] = useState(false);

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
    enabled: open,
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

  useEffect(() => {
    if (!open || !resumeDraft) return;
    applyDraft(acceptResume() ?? resumeDraft);
    setHydrated(true);
  }, [open, resumeDraft, acceptResume, applyDraft]);

  useEffect(() => {
    if (!open) {
      setHydrated(false);
    }
  }, [open]);

  useEffect(() => {
    setCashAccounts([]);
    setMoneyAccountId("");
    resetCountFields();
    setDateText("");
    setHydrated(false);
  }, [entityId, resetCountFields]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const cashRes = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    const active = cashRes.items.filter((a) => a.is_active);
    setCashAccounts(active);
    const till = mainTillAccount(active);
    setMoneyAccountId(till?.id ?? "");
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
    if (!open || !storageReady || dateText) return;
    if (resumeDraft) return;
    const initial = defaultSessionDate
      ? defaultSessionDate.includes("-")
        ? formatTrDate(defaultSessionDate)
        : defaultSessionDate
      : todayTrDate();
    setDateText(initial);
    setHydrated(true);
  }, [open, storageReady, dateText, resumeDraft, defaultSessionDate]);

  const tillAccount = mainTillAccount(cashAccounts);
  const homeAccount = cashHomeReferenceAccount(cashAccounts);
  const selectedAccount = tillAccount;
  const expectedKurus = selectedAccount?.balance_kurus ?? null;
  const noteLines = denominationLinesFromQuantities(quantities);
  const notesTotal = denominationTotalKurus(noteLines);
  const draftActive = !isCashCountDraftEmpty(draftSnapshot);

  useEffect(() => {
    onDraftChange?.(draftActive && open);
  }, [draftActive, open, onDraftChange]);

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

  function discardDraft() {
    clearDraft();
    resetCountFields();
    setDateText(todayTrDate());
  }

  function onSave(event: FormEvent) {
    event.preventDefault();
    if (isCashCountDraftEmpty(draftSnapshot)) {
      toast("Enter a counted total or note quantities first");
      return;
    }
    toast("Count saved on this device — use Close day to post it");
    onDraftChange?.(true);
  }

  if (!open) return null;

  const formBody = (
    <form onSubmit={onSave} className="space-y-3" data-testid="cash-count-form">
      {hydrated && draftActive && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Count saved on this device — leave and come back anytime. Close day
            posts it to the books.
          </span>
          <Button type="button" variant="ghost" onClick={discardDraft}>
            Discard
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Count the <strong>Main</strong> till and compare to the books. This does{" "}
        <strong>not</strong> post over/short or lock the day — use{" "}
        <strong>Close day</strong> for that.
      </p>
      <div>
        <Label htmlFor="cash-count-date">Session date (DD.MM.YYYY)</Label>
        <DateInput
          id="cash-count-date"
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
        <Label htmlFor="cash-count-counted">Counted balance (TRY)</Label>
        <MoneyInput
          id="cash-count-counted"
          placeholder="2.350,00"
          value={countedText}
          onChange={setCountedText}
          required
          disabled={useNotes && noteLines.length > 0}
        />
        {useNotes && noteLines.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Filled from the note count — clear notes to type a total by hand.
          </p>
        )}
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
              ? "Matches the books (preview)"
              : overShortKurus > 0
                ? "Would be over (preview)"
                : "Would be short (preview)"}
          </span>
          <span className="font-semibold tabular-nums">
            {overShortKurus > 0 ? "+" : ""}
            {formatTry(overShortKurus)}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          Save count
        </Button>
        {onContinueToCloseDay && (
          <Button
            type="button"
            disabled={isCashCountDraftEmpty(draftSnapshot)}
            onClick={() => {
              if (isCashCountDraftEmpty(draftSnapshot)) {
                toast("Enter a counted total first");
                return;
              }
              onContinueToCloseDay();
            }}
          >
            Continue to Close day
          </Button>
        )}
        {!embedded && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </form>
  );

  if (embedded) return formBody;

  return (
    <Dialog open={open} title="Count cash" onClose={onClose} size="default">
      {formBody}
    </Dialog>
  );
}
