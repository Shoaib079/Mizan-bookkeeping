/** Transaction action registry (audit C1) — single source of truth mapping
 * every journal-entry source to its label, the page that owns its flow, and
 * whether the generic ledger void/correct endpoints are accounting-safe for it.
 *
 * Accounting safety: only sources in GENERIC_CORRECTABLE_SOURCES may use
 * POST /ledger/entries/{id}/void|correct. Subledger-backed sources (expenses,
 * payables, staff, partners, customers, FX, group sales) must use their
 * feature endpoints, reached via the flow page — voiding them through the
 * generic path would skip subledger bookkeeping. Delivery and POS voids
 * (phase 5) also live on their flow pages: /pos/daily-summaries/{id}/void,
 * /pos/settlements/{id}/void, /delivery/reports/{id}/void,
 * /delivery/settlements/{id}/void.
 */

export const JOURNAL_SOURCES = [
  "manual",
  "opening_balance",
  "invoice",
  "payment",
  "transfer",
  "pos_settlement",
  "card_sales",
  "pos_card_tip",
  "pos_commission_sweep",
  "pos_commission_statement",
  "delivery_report",
  "delivery_settlement",
  "delivery_commission",
  "bank_fee",
  "credit_card_payment",
  "cash_movement",
  "cash_drawer_close",
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
  "partner_capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
  "partner_profit_allocation",
  "partner_profit_paid",
  "partner_supplier_paid",
  "expense_personal_split",
  "customer_credit_sale",
  "group_sale",
  "customer_payment_received",
  "expense_entry",
  "year_end_close",
  "system",
  "rule_auto",
] as const;

export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/** Sources where the generic ledger correct/void endpoints are safe (mirrors
 * the backend allowlist; previously duplicated as CORRECTABLE_SOURCES in the
 * general-ledger panel). */
export const GENERIC_CORRECTABLE_SOURCES = new Set<string>([
  "manual",
  "bank_fee",
  "pos_commission_sweep",
  "pos_commission_statement",
]);

/** Sources safe to VOID (but not edit/correct) through the generic ledger void
 * endpoint. These are plain journal entries with no subledger rows, so the
 * generic reversal is complete. */
export const GENERIC_VOID_SAFE_SOURCES = new Set<string>([
  ...GENERIC_CORRECTABLE_SOURCES,
  // A year-end close is a plain journal entry with no subledger rows, so the
  // generic reversal is complete. It belongs here because voiding it IS the
  // undo — it restores the revenue and expense balances and reopens the year
  // for re-closing. Without it the owner could seal a year and never unseal it.
  "year_end_close",
  // Plain money-account journals (no feature subledger). Void from GL is the
  // undo path for a mistaken count over/short or drawer-to-drawer transfer.
  "transfer",
  "cash_drawer_close",
]);

/** Partner/owner books language — what the money is, not how the app posted it. */
const SOURCE_LABELS: Record<string, string> = {
  manual: "Adjustment",
  opening_balance: "Opening balance",
  invoice: "Supplier invoice",
  payment: "Supplier payment",
  transfer: "Transfer",
  pos_settlement: "Card deposit",
  card_sales: "Card sales",
  pos_card_tip: "Card tip",
  pos_commission_sweep: "Card commission",
  pos_commission_statement: "Card commission",
  delivery_report: "Delivery sales",
  delivery_settlement: "Delivery deposit",
  delivery_commission: "Delivery commission",
  bank_fee: "Bank fee",
  credit_card_payment: "Credit card payment",
  cash_movement: "Cash movement",
  cash_drawer_close: "Cash drawer count",
  fx_purchase: "Foreign currency purchase",
  staff_accrual: "Salary accrual",
  staff_advance: "Staff advance",
  staff_payment: "Salary payment",
  partner_expense_fronted: "Partner paid expense",
  partner_reimbursement_paid: "Partner reimbursement",
  partner_drawing: "Partner drawing",
  partner_drawing_repayment: "Partner drawing repayment",
  partner_capital_contribution: "Partner capital",
  partner_loan_received: "Partner loan received",
  partner_loan_repaid: "Partner loan repaid",
  partner_profit_allocation: "Partner profit share",
  partner_profit_paid: "Partner profit paid",
  partner_supplier_paid: "Partner paid supplier",
  expense_personal_split: "Expense personal split",
  customer_credit_sale: "Customer credit sale",
  group_sale: "Group sale",
  customer_payment_received: "Customer payment",
  fx_conversion: "Foreign currency conversion",
  fx_expense_spend: "Foreign currency expense",
  expense_entry: "Miscellaneous expense",
  year_end_close: "Year-end close",
  system: "Other income",
  rule_auto: "Bank transaction",
};

/** The source column, for a row that may be a reversal.
 *
 * A void writes its reversal with source `system`, which is also what genuine
 * other bank income uses — so the reversal of a supplier invoice appeared in
 * the ledger reading "Other income", directly above the invoice it cancelled.
 * In a bookkeeping app that is not a cosmetic problem.
 *
 * The reversal is told apart by `reverses_entry_id`, which it always carries
 * and ordinary income never does. No data changes: a posted entry's source is
 * part of the record and the database enforces that.
 */
export function ledgerRowSourceLabel(
  source: string,
  reversesEntryId: string | null | undefined,
): string {
  if (reversesEntryId) return "Void reversal";
  return sourceLabel(source);
}

export function sourceLabel(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return source
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type SourceFlow = {
  /** Page that owns this transaction family's edit/void flow. */
  href: string;
  /** Human label for "Open in …". */
  label: string;
};

const SOURCE_FLOWS: Record<string, SourceFlow> = {
  manual: { href: "/review/manual-journals", label: "Manual journals" },
  year_end_close: { href: "/reports/month-close", label: "Month close" },
  opening_balance: {
    href: "/onboarding/opening-balances",
    label: "Opening balances",
  },
  invoice: { href: "/review/invoices", label: "Invoices" },
  payment: { href: "/suppliers", label: "Suppliers" },
  transfer: { href: "/banking/transfers", label: "Transfers" },
  pos_settlement: { href: "/cards", label: "Card clearing" },
  card_sales: { href: "/cards", label: "Card clearing" },
  pos_card_tip: { href: "/cards", label: "Card clearing" },
  pos_commission_sweep: { href: "/cards", label: "Card clearing" },
  pos_commission_statement: { href: "/cards", label: "Card clearing" },
  delivery_report: { href: "/delivery/reports", label: "Delivery reports" },
  delivery_settlement: {
    href: "/delivery/settlements",
    label: "Delivery settlements",
  },
  // A commission invoice is an invoice: it arrives as an e-Fatura and is
  // reviewed with the others. It pointed at Delivery settlements, which is
  // where the *money* is reconciled and where the invoice cannot be touched —
  // so "edit or void it in Delivery settlements" was a dead end.
  delivery_commission: {
    href: "/review/invoices",
    label: "Invoices",
  },
  bank_fee: { href: "/reports/ledger", label: "General ledger" },
  credit_card_payment: { href: "/banking/cards", label: "Credit cards" },
  cash_movement: { href: "/banking/cash", label: "Cash drawer" },
  cash_drawer_close: { href: "/banking/cash", label: "Cash drawer" },
  fx_purchase: { href: "/banking/fx", label: "Foreign currency" },
  fx_conversion: { href: "/banking/fx", label: "Foreign currency" },
  fx_expense_spend: { href: "/banking/fx", label: "Foreign currency" },
  staff_accrual: { href: "/staff", label: "Staff" },
  staff_advance: { href: "/staff", label: "Staff" },
  staff_payment: { href: "/staff", label: "Staff" },
  partner_expense_fronted: { href: "/partners", label: "Partners" },
  partner_reimbursement_paid: { href: "/partners", label: "Partners" },
  partner_drawing: { href: "/partners", label: "Partners" },
  partner_drawing_repayment: { href: "/partners", label: "Partners" },
  partner_capital_contribution: { href: "/partners", label: "Partners" },
  partner_loan_received: { href: "/partners", label: "Partners" },
  partner_loan_repaid: { href: "/partners", label: "Partners" },
  partner_profit_allocation: { href: "/partners", label: "Partners" },
  partner_profit_paid: { href: "/partners", label: "Partners" },
  partner_supplier_paid: { href: "/partners", label: "Partners" },
  expense_personal_split: { href: "/split", label: "Split" },
  customer_credit_sale: { href: "/customers", label: "Customers" },
  group_sale: { href: "/customers/group-sales", label: "Group sales" },
  customer_payment_received: { href: "/customers", label: "Customers" },
  expense_entry: { href: "/review/expenses", label: "Expenses" },
  rule_auto: { href: "/banking/review", label: "Bank review" },
  system: { href: "/banking/review", label: "Bank review" },
};

/** Where this transaction family is managed; null for system sources. */
export function sourceFlow(source: string): SourceFlow | null {
  return SOURCE_FLOWS[source] ?? null;
}

/** GL deep link that focuses one entry — used for correction-chain links. */
export function ledgerEntryHref(entryId: string): string {
  return `/reports/ledger?focus=${entryId}`;
}

export function genericVoidPath(entityId: string, entryId: string): string {
  return `/entities/${entityId}/ledger/entries/${entryId}/void`;
}
