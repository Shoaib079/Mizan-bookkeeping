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
  | "store_purchase"
  | "credit_card_payment"
  | "customer_payment"
  | "staff_payment"
  | "staff_advance"
  | "staff_incentive"
  | "partner_drawing"
  | "partner_reimbursement"
  | "partner_drawing_repayment"
  | "loan_payment"
  | "loan_receipt"
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
  employee_id?: string | null;
  partner_id?: string | null;
  customer_id?: string | null;
  review_reason: string | null;
  journal_entry_id: string | null;
  candidate_supplier_ledger_entry_id?: string | null;
  candidate_account_transfer_id?: string | null;
  classification_source?: string | null;
  suggestion?: ClassificationSuggestion | null;
};

export type ClassificationSuggestion = {
  classification: StatementLineClassification;
  supplier_id: string | null;
  delivery_platform_id?: string | null;
  expense_account_id?: string | null;
  reason: string;
  confidence: string;
};

export type NeedsReviewStatementLine = BankStatementLine & {
  money_account_id: string;
  original_filename: string;
};

export type StatementLineReview = BankStatementLine & {
  money_account_id?: string;
  original_filename?: string;
};

export type ClassifyStatementLineResult = {
  line: BankStatementLine;
  linked_existing_payment: boolean;
  linked_existing_transfer?: boolean;
  routed_to_needs_review?: boolean;
  journal_entry_id: string | null;
};

export type CreateSupplierFromLineResult = {
  supplier_id: string;
  supplier_name: string;
  line: BankStatementLine;
};

export type BankStatementRead = {
  id: string;
  entity_id: string;
  money_account_id: string;
  period_start: string;
  period_end: string;
  original_filename: string;
  line_count: number;
  skipped_duplicate_count?: number;
  imported_at: string;
  lines: BankStatementLine[];
};

export type BankStatementPreview = {
  rows: string[][];
  total_rows: number;
  csv_encoding: string | null;
  csv_delimiter: string | null;
  suggested_profile: BankImportProfileUpsert | null;
};

export type BankImportProfileUpsert = {
  header_row: number;
  data_start_row: number;
  data_end_row?: number | null;
  date_col: number;
  description_col: number;
  description_extra_cols?: number[];
  reference_col: number | null;
  amount_col: number | null;
  debit_col: number | null;
  credit_col: number | null;
  date_format: string;
  decimal_format: string;
  debit_is_outflow: boolean;
  csv_encoding?: string;
  csv_delimiter?: string;
};

export type BankImportProfileRead = {
  id: string;
  entity_id: string;
  money_account_id: string;
  header_row: number;
  data_start_row: number;
  data_end_row: number | null;
  date_col: number;
  description_col: number;
  description_extra_cols?: number[];
  reference_col: number | null;
  amount_col: number | null;
  debit_col: number | null;
  credit_col: number | null;
  date_format: string;
  decimal_format: string;
  debit_is_outflow: boolean;
  csv_encoding: string;
  csv_delimiter: string;
  updated_at: string;
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

export type CreditCardPaymentRead = {
  id: string;
  credit_card_money_account_id: string;
  bank_money_account_id: string;
  payment_date: string;
  amount_kurus: number;
  description: string;
  journal_entry_id: string;
  bank_statement_line_id: string | null;
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
  reopen_reason?: string | null;
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
  fx_money_account_id: string;
  movement_date: string;
  movement_type: string;
  native_quantity: number;
  try_cost_kurus: number;
  description: string;
  journal_entry_id: string;
  journal_source?: string | null;
  created_at: string;
  display_kind?: "effective" | "void_reversal" | "superseded";
  was_corrected?: boolean;
};
