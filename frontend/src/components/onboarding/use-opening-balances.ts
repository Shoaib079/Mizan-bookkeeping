"use client";

/** State + load/validate/post for OpeningBalancesPage (file-size split). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { useEntity } from "@/lib/entity-context";
import { useFormDraft } from "@/lib/form-draft";
import {
  defaultBankAccountId,
  defaultMainDrawerId,
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { parseTrDate } from "@/lib/money";
import {
  type ChartAccountName,
  type NamedRow,
  type OpeningBalancesDraft,
  isOpeningBalancesDraftEmpty,
  newOpeningBalanceLine,
  openingBalanceLineHint,
  openingBalanceLineToPayload,
  openingBalanceSideTotal,
} from "@/lib/opening-balances-draft";
import type {
  JournalLineOut,
  OpeningBalanceAccount,
  OpeningBalanceLineDraft,
  OpeningBalancePostResponse,
  OpeningBalanceValidateResponse,
} from "@/lib/settings-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export function useOpeningBalances() {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [wizardSteps, setWizardSteps] = useState<string[]>([]);
  const [obAccounts, setObAccounts] = useState<OpeningBalanceAccount[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccountOption[]>([]);
  const [suppliers, setSuppliers] = useState<NamedRow[]>([]);
  const [partners, setPartners] = useState<NamedRow[]>([]);
  const [customers, setCustomers] = useState<NamedRow[]>([]);
  const [goLiveDate, setGoLiveDate] = useState("");
  const [lines, setLines] = useState<OpeningBalanceLineDraft[]>([
    newOpeningBalanceLine(),
  ]);
  const [chartNames, setChartNames] = useState<ChartAccountName[]>([]);
  const [preview, setPreview] = useState<JournalLineOut[] | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [posted, setPosted] = useState<OpeningBalancePostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const goLiveFocusedRef = useRef(false);

  /** "1100 — Bank" rather than "1100".
   *
   * The code alone means nothing unless you have the chart memorised, and this
   * preview is the last thing anyone reads before opening balances hit the
   * ledger — the one screen where the accounts should be unambiguous. Falls
   * back to the bare code if the chart has not loaded or lacks the account,
   * which is still the old behaviour rather than a blank cell.
   */
  const accountLabel = useCallback(
    (code: string): string => {
      const match =
        chartNames.find((a) => a.code === code) ??
        obAccounts.find((a) => a.code === code);
      return match ? formatChartAccountLabel(match) : code;
    },
    [chartNames, obAccounts],
  );

  const draftSnapshot = useMemo<OpeningBalancesDraft>(
    () => ({ goLiveDate, lines }),
    [goLiveDate, lines],
  );

  const { resumeDraft, acceptResume, declineResume, clearDraft } = useFormDraft({
    entityId,
    formKey: "opening-balances",
    value: draftSnapshot,
    enabled: Boolean(entityId) && !posted,
    isEmpty: isOpeningBalancesDraftEmpty,
  });

  const lineHints = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        hint: openingBalanceLineHint(line),
      })),
    [lines],
  );
  const hasLineIssues = lineHints.some((row) => row.hint !== null);
  const debitTotal = useMemo(
    () => openingBalanceSideTotal(lines, "debit"),
    [lines],
  );
  const creditTotal = useMemo(
    () => openingBalanceSideTotal(lines, "credit"),
    [lines],
  );
  const hasAccountSides = lines.some(
    (line) => line.target === "account" && line.side,
  );
  const balanceMismatch =
    hasAccountSides &&
    debitTotal > 0 &&
    creditTotal > 0 &&
    debitTotal !== creditTotal;
  const validateBlocked = hasLineIssues;

  const cashAccountCount = useMemo(
    () => moneyAccounts.filter((a) => a.account_kind === "cash").length,
    [moneyAccounts],
  );

  const loadRefs = useCallback(async () => {
    if (!entityId) return;
    setError(null);
    try {
      const [obRes, chartRes, money, supRes, partRes, custRes] =
        await Promise.all([
          apiFetch<OpeningBalanceAccount[]>(
            "/chart-of-accounts/default/opening-balance-accounts",
          ),
          // The whole chart, only so the journal preview can name its rows.
          // opening-balance-accounts is filtered to accepts_opening_balance,
          // which excludes the control accounts (receivables, payables,
          // partner capital) that the preview derives from supplier, customer
          // and partner lines — those would have stayed bare codes.
          // 200 is MAX_LIST_LIMIT on the API. This asked for 500, which fails
          // validation with a 422, and the catch swallowed it — so every
          // preview row fell back to a bare code and nothing said why.
          apiFetch<{ items: ChartAccountName[] }>(
            `/entities/${entityId}/chart-of-accounts?limit=200`,
          ),
          loadBankAndCashAccounts(entityId),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/suppliers?limit=100`,
          ),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/partners?limit=100`,
          ),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/customers?limit=100`,
          ),
        ]);
      setObAccounts(obRes);
      setChartNames(chartRes.items);
      setMoneyAccounts(money);
      setSuppliers(supRes.items);
      setPartners(partRes.items);
      setCustomers(custRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load references");
    }
  }, [entityId]);

  useEffect(() => {
    void apiFetch<string[]>("/onboarding/wizard-steps")
      .then(setWizardSteps)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  function applyOpeningBalancesDraft(draft: OpeningBalancesDraft) {
    setGoLiveDate(draft.goLiveDate);
    setLines(
      draft.lines.length > 0 ? draft.lines : [newOpeningBalanceLine()],
    );
    setPreview(null);
    setPosted(null);
  }

  function handleResumeDraft() {
    const draft = acceptResume();
    if (!draft) return;
    applyOpeningBalancesDraft(draft);
  }

  function handleDeclineResume() {
    declineResume();
  }

  useEffect(() => {
    if (!entityId || goLiveFocusedRef.current) return;
    goLiveFocusedRef.current = true;
    window.setTimeout(() => document.getElementById("go-live")?.focus(), 0);
  }, [entityId]);

  useEffect(() => {
    if (!focusLineId) return;
    window.setTimeout(
      () => document.getElementById(`ob-amount-${focusLineId}`)?.focus(),
      0,
    );
    setFocusLineId(null);
  }, [focusLineId]);

  function updateLine(
    id: string,
    patch: Partial<OpeningBalanceLineDraft>,
  ) {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
    setPreview(null);
    setPosted(null);
  }

  function removeLine(id: string) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id),
    );
    setPreview(null);
    setPosted(null);
  }

  function addBlankLine() {
    const line = newOpeningBalanceLine();
    setLines((prev) => [...prev, line]);
    setFocusLineId(line.id);
  }

  function addCashDrawerLine() {
    const drawerId = defaultMainDrawerId(moneyAccounts);
    if (!drawerId) return;
    const line: OpeningBalanceLineDraft = {
      ...newOpeningBalanceLine(),
      target: "money_account",
      moneyAccountId: drawerId,
    };
    setLines((prev) => [...prev, line]);
    setFocusLineId(line.id);
  }

  function addBankAccountLine() {
    const bankId = defaultBankAccountId(moneyAccounts);
    if (!bankId) return;
    const line: OpeningBalanceLineDraft = {
      ...newOpeningBalanceLine(),
      target: "money_account",
      moneyAccountId: bankId,
    };
    setLines((prev) => [...prev, line]);
    setFocusLineId(line.id);
  }

  async function onValidate(event?: FormEvent) {
    event?.preventDefault();
    if (!entityId) return;
    setValidating(true);
    setError(null);
    setPreview(null);
    setPosted(null);
    try {
      const payloadLines = lines.map(openingBalanceLineToPayload);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const res = await apiFetch<OpeningBalanceValidateResponse>(
        `/onboarding/entities/${entityId}/opening-balances/validate`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: payloadLines }),
        },
      );
      submitIdempotency.completeSubmit();
      setPreview(res.journal_lines);
      setPreviewMessage(res.message);
      toast("Balances validated — review preview below");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function onPost() {
    if (!entityId || !preview) return;
    const iso = parseTrDate(goLiveDate);
    if (!iso) {
      setError("Enter go-live date as DD.MM.YYYY.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const payloadLines = lines.map(openingBalanceLineToPayload);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const res = await apiFetch<OpeningBalancePostResponse>(
        `/onboarding/entities/${entityId}/opening-balances/post`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            go_live_date: iso,
            actor_id: actorId,
            lines: payloadLines,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setPosted(res);
      setPreview(res.journal_lines);
      clearDraft();
      toast("Opening balances posted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  return {
    entityId,
    wizardSteps,
    resumeDraft,
    handleResumeDraft,
    handleDeclineResume,
    goLiveDate,
    setGoLiveDate,
    posted,
    lines,
    lineHints,
    obAccounts,
    moneyAccounts,
    suppliers,
    partners,
    customers,
    cashAccountCount,
    updateLine,
    removeLine,
    addBlankLine,
    addCashDrawerLine,
    addBankAccountLine,
    canAddCashDrawer: Boolean(defaultMainDrawerId(moneyAccounts)),
    canAddBank: Boolean(defaultBankAccountId(moneyAccounts)),
    balanceMismatch,
    debitTotal,
    creditTotal,
    hasLineIssues,
    error,
    onValidate,
    validating,
    validateBlocked,
    preview,
    previewMessage,
    posting,
    onPost,
    accountLabel,
  };
}
