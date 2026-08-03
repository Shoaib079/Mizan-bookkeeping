/** Edit/void eligibility — mirrors backend `core/ledger/correction.py`.
 *
 * Policy: every posted movement is editable and voidable on its owning page.
 * Bank-statement postings (`rule_auto`, `system`) and other void-and-re-enter
 * sources are void-only. Generic GL correct/void endpoints are only for the
 * small accounting-safe allowlist in `transaction-registry.ts`.
 */

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
  "expense_entry",
]);

/** Void and re-enter — no edit/correct API (bank classify, POS batch, etc.). */
export const VOID_ONLY_JOURNAL_SOURCES = new Set<string>([
  "opening_balance",
  "transfer",
  "pos_settlement",
  "card_sales",
  "pos_card_tip",
  "delivery_report",
  "delivery_settlement",
  "delivery_commission",
  "credit_card_payment",
  "cash_movement",
  "cash_drawer_close",
  "rule_auto",
  "system",
  "partner_profit_allocation",
  "partner_capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
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
]);

export const PARTNER_VOID_ONLY_MOVEMENT_TYPES = new Set<string>([
  "capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
]);

export const STAFF_EDITABLE_MOVEMENT_TYPES = new Set<string>([
  "salary_accrued",
  "advance_paid",
  "salary_payment",
  "extra_days_accrued",
  "extra_days_paid",
]);

export const STAFF_VOID_ONLY_MOVEMENT_TYPES = new Set<string>([
  "advance_applied",
  "advance_returned",
]);

export function journalEntryRowActions(source: string): RowActions {
  if (GENERIC_CORRECTABLE_SOURCES.has(source)) {
    return { canEdit: true, canVoid: true };
  }
  if (GENERIC_VOID_SAFE_SOURCES.has(source)) {
    return { canEdit: false, canVoid: true };
  }
  if (DEDICATED_CORRECTION_JOURNAL_SOURCES.has(source)) {
    return { canEdit: true, canVoid: true };
  }
  if (VOID_ONLY_JOURNAL_SOURCES.has(source)) {
    return { canEdit: false, canVoid: true };
  }
  return { canEdit: false, canVoid: false };
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

export function partnerLedgerRowActions(movementType: string): RowActions {
  if (PARTNER_EDITABLE_MOVEMENT_TYPES.has(movementType)) {
    return { canEdit: true, canVoid: true };
  }
  if (PARTNER_VOID_ONLY_MOVEMENT_TYPES.has(movementType)) {
    return { canEdit: false, canVoid: true };
  }
  if (movementType === "profit_allocation") {
    return { canEdit: false, canVoid: false };
  }
  return { canEdit: false, canVoid: false };
}

export type StaffLedgerActionContext = {
  movementType: string;
  payCurrency: string;
  isAdvanceOffset: boolean;
  advanceAppliedMinor: number;
};

export function staffLedgerRowActions(ctx: StaffLedgerActionContext): RowActions {
  const isTry = ctx.payCurrency === "TRY";
  const canEdit =
    isTry &&
    !ctx.isAdvanceOffset &&
    ctx.advanceAppliedMinor <= 0 &&
    STAFF_EDITABLE_MOVEMENT_TYPES.has(ctx.movementType);
  const canVoid =
    canEdit ||
    ctx.isAdvanceOffset ||
    ctx.advanceAppliedMinor > 0 ||
    STAFF_VOID_ONLY_MOVEMENT_TYPES.has(ctx.movementType) ||
    STAFF_EDITABLE_MOVEMENT_TYPES.has(ctx.movementType);
  return { canEdit, canVoid };
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
