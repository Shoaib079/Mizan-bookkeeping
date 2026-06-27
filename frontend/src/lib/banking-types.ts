/** Banking API shapes — Phase 9 Slice 4. */

export type MoneyAccountKind =
  | "bank"
  | "cash"
  | "credit_card"
  | "foreign_currency";

export type MoneyAccountLeaf = {
  id: string;
  name: string;
  account_kind: MoneyAccountKind;
  currency: string | null;
  gl_account_code: string;
  bank_name: string | null;
  iban: string | null;
  last_four: string | null;
  is_active: boolean;
  balance_kurus: number;
  native_quantity: number | null;
};

export type MoneyAccountBranch = {
  bucket_code: string;
  bucket_name_en: string;
  bucket_name_tr: string;
  balance_kurus: number;
  accounts: MoneyAccountLeaf[];
};

export type MoneyAccountTree = {
  banks: MoneyAccountBranch;
  cash: MoneyAccountBranch;
  credit_cards: MoneyAccountBranch;
  foreign_currency: {
    usd: MoneyAccountBranch;
    eur: MoneyAccountBranch;
    gbp: MoneyAccountBranch;
  };
};

export type MoneyAccountRead = MoneyAccountLeaf & {
  entity_id: string;
  gl_account_id: string;
  created_at: string;
  updated_at: string;
};

export type StatementLineStatus =
  | "imported"
  | "classified"
  | "needs_review"
  | "posted"
  | "linked";

export type StatementLineClassification =
  | "unclassified"
  | "supplier_payment"
  | "transfer"
  | "pos_settlement"
  | "delivery_settlement"
  | "bank_fee"
  | "rent_utility"
  | "credit_card_payment"
  | "customer_payment"
  | "unknown";

export type BankStatementLine = {
  id: string;
  statement_id: string;
  transaction_date: string;
  amount_kurus: number;
  description: string;
  reference: string | null;
  classification: StatementLineClassification;
  status: StatementLineStatus;
  supplier_id: string | null;
  review_reason: string | null;
  journal_entry_id: string | null;
};

export type BankStatementRead = {
  id: string;
  entity_id: string;
  money_account_id: string;
  period_start: string;
  period_end: string;
  original_filename: string;
  line_count: number;
  imported_at: string;
  lines: BankStatementLine[];
};

export type AccountTransferRead = {
  id: string;
  from_money_account_id: string;
  to_money_account_id: string;
  amount_kurus: number;
  transfer_date: string;
  description: string;
  created_at: string;
};

export type CashDrawerSessionRead = {
  id: string;
  money_account_id: string;
  session_date: string;
  status: "open" | "closed";
  expected_balance_kurus: number | null;
  counted_balance_kurus: number | null;
  over_short_kurus: number | null;
  closed_at: string | null;
};

export type CashMovementRead = {
  id: string;
  movement_date: string;
  direction: "in" | "out";
  amount_kurus: number;
  description: string;
};

export type CashDrawerSessionDetail = CashDrawerSessionRead & {
  movements: CashMovementRead[];
};

export type FxBalanceRead = {
  fx_money_account_id: string;
  currency: string;
  native_quantity: number;
  try_cost_kurus: number;
  gl_balance_kurus: number;
};

export type FxLedgerEntryRead = {
  id: string;
  movement_date: string;
  movement_type: string;
  native_quantity: number;
  try_cost_kurus: number;
  description: string;
  journal_entry_id: string;
  created_at: string;
};
