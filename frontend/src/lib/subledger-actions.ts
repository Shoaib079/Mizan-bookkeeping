/** Edit/void eligibility — mirrors backend `core/ledger/correction.py`.
 *
 * Policy: every posted movement is editable and voidable on its owning page.
 * Bank-statement postings (`rule_auto`, `system`) and other void-and-re-enter
 * sources are void-only. Generic GL correct/void endpoints are only for the
 * small accounting-safe allowlist in `transaction-registry.ts`.
 */

import {
  canModifyEntryDate,
  canModifyJournalSource,
} from "@/lib/entity-access";
import {
  GENERIC_CORRECTABLE_SOURCES,
  GENERIC_VOID_SAFE_SOURCES,
  sourceFlow,
} from "@/lib/transaction-registry";

export type RowActions = {
  canEdit: boolean;
  canVoid: boolean;
};

/** Dedicated correction APIs (void + repost with subledger). */
export const DEDICATED_CORRECTION_JOURNAL_SOURCES = new Set<string>([
  "payment",
  "invoice",
  "customer_credit_sale",
  "group_sale",
  "customer_payment_received",
  "fx_purchase",
  "fx_conversion",
  "fx_expense_spend",
  "staff_accrual",
  "staff_advance",
  "staff_payment",
  "partner_expense_fronted",
  "partner_reimbursement_paid",
  "partner_drawing",
  "partner_drawing_repayment",
  // Two lines and one subledger row, like a drawing. It was void-only until
  // the owner asked why: nothing about it needed void-and-re-enter, only a
  // bound on the amount, which the backend now checks against profit allocated.
  "partner_profit_paid",
  // Same class as profit paid (2026-08-21): mistyped capital/loan amounts need
  // Edit via the dedicated partner ledger correct route — not void-and-reenter.
  "partner_capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
  // Dual subledger, so it has its own correct route rather than the generic
  // one — both legs move together or neither does.
  "partner_salary_fronted",
  "expense_entry",
  "partner_profit_allocation",
  // A commission invoice is an invoice. It sat in the void-only set and
  // resolved to neither edit nor void, so a wrong one was stuck in the books
  // with no way out of the app at all.
  "delivery_commission",
]);

/** Void and re-enter — no edit/correct API (bank classify, POS batch, etc.).
 *
 * `opening_balance`, `pos_card_tip`, `credit_card_payment` and `cash_movement`
 * were here and are not any more. The backend offers no void path for them —
 * each is corrected through the record that owns it, and voiding half of one
 * from the General ledger would leave the other half standing. Listing them
 * here drew a Void button whose handler then read `void_path: null` from the
 * API and returned without a word: four buttons that did nothing, which is
 * indistinguishable from four buttons that are broken.
 */
export const VOID_ONLY_JOURNAL_SOURCES = new Set<string>([
  "transfer",
  "pos_settlement",
  "card_sales",
  "delivery_report",
  "delivery_settlement",
  "cash_drawer_close",
  "rule_auto",
  "system",
  "partner_supplier_paid",
  "expense_personal_split",
  "year_end_close",
]);

/** Bank statement classify — void only, never edit in place. */
export const BANK_VOID_ONLY_JOURNAL_SOURCES = new Set<string>([
  "rule_auto",
  "system",
]);

export const PARTNER_EDITABLE_MOVEMENT_TYPES = new Set<string>([
  "expense_fronted",
  "reimbursement_paid",
  "drawing",
  "drawing_repayment",
  // Two lines and one subledger row, like a drawing. The amount it may be
  // corrected to is bounded by profit allocated, which the backend checks.
  "profit_paid",
  // Corrected through its own route, which moves the staff rows with it.
  "salary_fronted",
  // 2026-08-21 — owner mistypes capital amounts; loans same class.
  "capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
]);

export const PARTNER_VOID_ONLY_MOVEMENT_TYPES = new Set<string>([]);

export type JournalActionOptions = {
  grants?: readonly string[];
  entryDate?: string;
};

export function journalEntryRowActions(
  source: string,
  options?: JournalActionOptions,
): RowActions {
  let actions: RowActions;
  if (GENERIC_CORRECTABLE_SOURCES.has(source)) {
    actions = { canEdit: true, canVoid: true };
  } else if (GENERIC_VOID_SAFE_SOURCES.has(source)) {
    actions = { canEdit: false, canVoid: true };
  } else if (DEDICATED_CORRECTION_JOURNAL_SOURCES.has(source)) {
    actions = { canEdit: true, canVoid: true };
  } else if (VOID_ONLY_JOURNAL_SOURCES.has(source)) {
    actions = { canEdit: false, canVoid: true };
  } else {
    actions = { canEdit: false, canVoid: false };
  }

  if (options?.grants) {
    if (!canModifyJournalSource(options.grants, source)) {
      return { canEdit: false, canVoid: false };
    }
    if (
      options.entryDate &&
      !canModifyEntryDate(options.grants, options.entryDate)
    ) {
      return { canEdit: false, canVoid: false };
    }
  }

  return actions;
}

export function canUseGenericLedgerCorrect(source: string): boolean {
  return GENERIC_CORRECTABLE_SOURCES.has(source);
}

export function canUseGenericLedgerVoid(source: string): boolean {
  return GENERIC_VOID_SAFE_SOURCES.has(source);
}

/** GL row: inline generic buttons vs link to the owning flow page. */
export function generalLedgerEntryActions(source: string): RowActions & {
  useGenericEndpoints: boolean;
  flowHref: string | null;
} {
  const flow = sourceFlow(source);
  const useGeneric =
    canUseGenericLedgerCorrect(source) || canUseGenericLedgerVoid(source);
  const actions = journalEntryRowActions(source);
  return {
    ...actions,
    useGenericEndpoints: useGeneric,
    flowHref: flow?.href ?? null,
  };
}

/* ------------------------------------------------------------------------
 * Below here the question is different, and that is why these stayed.
 *
 * Everything above answers "what may be done to this journal *entry*", keyed
 * on its source, and the backend's capability table answers the same question
 * — so the two are compared by a guard and must agree.
 *
 * These answer "what may be done from this *row*", keyed on movement type,
 * and one entry can own several rows:
 *
 *   - a profit allocation writes one partner row per partner, all against the
 *     same journal entry. A Void on Ali's row would void Burak's and Cem's
 *     share too.
 *   - a salary payment that applied an advance writes two rows on one entry;
 *     a period payment writes three. The offset leg is derived, not something
 *     to edit on its own.
 *
 * The backend has no way to say that yet — it is answering about the entry,
 * correctly. Until it can (see HARDENING_PLAN.md, owed item D2), these rules
 * stay here, and hiding those buttons is deliberate rather than drift.
 *
 * Customer rows are one-per-entry and already agree with the backend, so they
 * are safe to migrate whenever D2 lands.
 * --------------------------------------------------------------------- */

export function partnerLedgerRowActions(movementType: string): RowActions {
  if (PARTNER_EDITABLE_MOVEMENT_TYPES.has(movementType)) {
    return { canEdit: true, canVoid: true };
  }
  if (PARTNER_VOID_ONLY_MOVEMENT_TYPES.has(movementType)) {
    return { canEdit: false, canVoid: true };
  }
  if (movementType === "profit_allocation" || movementType === "profit_settlement") {
    return { canEdit: false, canVoid: false };
  }
  return { canEdit: false, canVoid: false };
}

export type CustomerLedgerActionContext = {
  movementType: string;
  referenceType?: string | null;
};

export function customerLedgerRowActions(
  ctx: CustomerLedgerActionContext,
): RowActions {
  if (ctx.movementType === "payment_received") {
    return { canEdit: true, canVoid: true };
  }
  if (ctx.movementType === "credit_sale") {
    if (ctx.referenceType === "group_sale") {
      return { canEdit: true, canVoid: true };
    }
    return { canEdit: true, canVoid: true };
  }
  // A write-off is corrected the same way as everything else here: void and
  // re-post in one transaction. It had no actions at all until recently, so a
  // mistaken write-off was permanent — and there was no way to repair the
  // ones posted before the forex balance was fixed, which recorded no
  // currency leg.
  if (ctx.movementType === "discount") {
    return { canEdit: true, canVoid: true };
  }
  return { canEdit: false, canVoid: false };
}

export function transactionPeekActions(source: string, status?: string): RowActions {
  if (status !== "posted") {
    return { canEdit: false, canVoid: false };
  }
  if (canUseGenericLedgerCorrect(source)) {
    return { canEdit: true, canVoid: true };
  }
  if (canUseGenericLedgerVoid(source)) {
    return { canEdit: false, canVoid: true };
  }
  return { canEdit: false, canVoid: false };
}
