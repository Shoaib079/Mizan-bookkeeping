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
  "staff_accrual",
  "staff_advance",
  "staff_payment",
  "partner_expense_fronted",
  "partner_reimbursement_paid",
  "customer_credit_sale",
  "customer_payment_received",
  "fx_conversion",
  "fx_expense_spend",
  "expense_entry",
  "system",
] as const;

export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/** Sources where the generic ledger correct/void endpoints are safe (mirrors
 * the backend allowlist; previously duplicated as CORRECTABLE_SOURCES in the
 * general-ledger panel). */
export const GENERIC_CORRECTABLE_SOURCES = new Set<string>(["manual", "bank_fee"]);

const SOURCE_LABELS: Record<string, string> = {
  bank_fee: "bank charges",
  pos_commission_sweep: "bank commission",
  pos_commission_statement: "card commission (statement)",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replaceAll("_", " ");
}

export type SourceFlow = {
  /** Page that owns this transaction family's edit/void flow. */
  href: string;
  /** Human label for "Open in …". */
  label: string;
};

const SOURCE_FLOWS: Record<string, SourceFlow> = {
  manual: { href: "/review/manual-journals", label: "Manual journals" },
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
  delivery_commission: {
    href: "/delivery/settlements",
    label: "Delivery settlements",
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
  customer_credit_sale: { href: "/customers", label: "Customers" },
  customer_payment_received: { href: "/customers", label: "Customers" },
  expense_entry: { href: "/review/expenses", label: "Expenses" },
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
