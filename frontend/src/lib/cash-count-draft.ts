/** Sticky cash-count draft — survives Record mode switches (DESIGN_SYSTEM §10). */

import {
  emptyDenominationQuantities,
  denominationLinesFromQuantities,
} from "@/lib/cash-denominations";
import { formDraftStorageKey } from "@/lib/form-draft";

export const CASH_COUNT_DRAFT_FORM_KEY = "cash-count";

export type CashCountDraft = {
  moneyAccountId: string;
  dateText: string;
  countedText: string;
  /** Denomination kuruş → quantity (JSON keys may be strings). */
  quantities: Record<string, number>;
  useNotes: boolean;
  description: string;
};

export function emptyCashCountDraft(): CashCountDraft {
  return {
    moneyAccountId: "",
    dateText: "",
    countedText: "",
    quantities: Object.fromEntries(
      Object.entries(emptyDenominationQuantities()).map(([k, v]) => [k, v]),
    ),
    useNotes: true,
    description: "Cash drawer EOD close",
  };
}

export function isCashCountDraftEmpty(draft: CashCountDraft): boolean {
  if (draft.countedText.trim()) return false;
  const lines = denominationLinesFromQuantities(
    normalizeDraftQuantities(draft.quantities),
  );
  return lines.length === 0;
}

export function normalizeDraftQuantities(
  quantities: Record<string, number> | Record<number, number>,
): Record<number, number> {
  const next = emptyDenominationQuantities();
  for (const [key, raw] of Object.entries(quantities)) {
    const denom = Number(key);
    if (!Number.isFinite(denom) || !(denom in next)) continue;
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    next[denom] = qty;
  }
  return next;
}

export function quantitiesToDraft(
  quantities: Record<number, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(quantities).map(([k, v]) => [k, v]),
  );
}

/** True when a non-empty count draft is saved for this restaurant. */
export function hasCashCountDraft(
  entityId: string | null | undefined,
): boolean {
  const key = formDraftStorageKey(entityId, CASH_COUNT_DRAFT_FORM_KEY);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const draft = JSON.parse(raw) as CashCountDraft;
    return !isCashCountDraftEmpty(draft);
  } catch {
    return false;
  }
}
