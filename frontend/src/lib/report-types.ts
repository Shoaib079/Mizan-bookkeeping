/** Report + dashboard API shapes (backend schema mirrors). */

export type DashboardRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  sales: {
    cash_sales_kurus: number;
    pos_card_sales_kurus: number;
    delivery_sales_kurus: number;
    group_sales_kurus: number;
    other_sales_kurus: number;
    total_sales_kurus: number;
  };
  delivery_platforms: {
    delivery_platform_id: string;
    platform_name: string;
    is_active: boolean;
    gross_kurus: number;
    report_count: number;
  }[];
  total_expenses_kurus: number;
  net_result_kurus: number;
  total_payables_kurus: number;
  payables_preview: {
    supplier_id: string;
    supplier_name: string;
    balance_kurus: number;
  }[];
  total_receivables_kurus: number;
  delivery_balance_left: {
    delivery_platform_id: string;
    platform_name: string;
    balance_left_kurus: number;
  }[];
  total_try_position_kurus: number;
  cash_in_hand_kurus: number;
  bank_balance_kurus: number;
  cash_accounts: { id: string; name: string; balance_kurus: number }[];
  fx_balances: {
    money_account_id: string;
    name: string;
    currency: string;
    native_quantity: number;
    try_cost_kurus: number;
  }[];
  tax_department_payments_kurus: number | null;
  needs_review: {
    invoice_drafts: number;
    invoice_duplicates: number;
    bank_statement_lines: number;
    pos_daily_summaries: number;
    delivery_reports: number;
    expense_entries: number;
    total: number;
  };
  confirmed_invoice_drafts: number;
};

export type ProfitAndLossRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  accounts: {
    account_id: string;
    code: string;
    name_en: string;
    account_type: string;
    amount_kurus: number;
  }[];
  total_revenue_kurus: number;
  total_expenses_kurus: number;
  net_income_kurus: number;
  source: ReportSource;
  sealed: SealedPeriodInfo | null;
};

export type ReportSource = "live" | "as_closed";

/** Present when the figures are the ones the month was sealed with. */
export type SealedPeriodInfo = {
  period_start: string;
  period_end: string;
  closed_at: string;
  /** Something was posted into the month after it was closed. */
  drifted: boolean;
  /** Headline total, signed live-minus-sealed. Null unless drifted. */
  drift_kurus: number | null;
};

export type BalanceSheetRead = {
  entity_id: string;
  as_of: string;
  assets: { accounts: BalanceSheetAccountRow[]; subtotal_kurus: number };
  liabilities: { accounts: BalanceSheetAccountRow[]; subtotal_kurus: number };
  equity: {
    accounts: BalanceSheetAccountRow[];
    subtotal_kurus: number;
    unclosed_net_income_kurus: number;
  };
  total_assets_kurus: number;
  total_liabilities_kurus: number;
  total_equity_kurus: number;
  total_liabilities_and_equity_kurus: number;
  accounting_equation_balanced: boolean;
  source: ReportSource;
  sealed: SealedPeriodInfo | null;
};

type BalanceSheetAccountRow = {
  account_id: string;
  code: string;
  name_en: string;
  account_type: string;
  balance_kurus: number;
};

export type CashFlowRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  opening_cash_kurus: number;
  closing_cash_kurus: number;
  net_change_kurus: number;
  operating: { inflows_kurus: number; outflows_kurus: number; net_kurus: number };
  investing: { inflows_kurus: number; outflows_kurus: number; net_kurus: number };
  financing: { inflows_kurus: number; outflows_kurus: number; net_kurus: number };
  by_source: { source: string; category: string; net_cash_kurus: number }[];
  reconciled_to_categories: boolean;
};

export type KdvInputReportRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  rates: {
    rate_percent: number;
    base_kurus: number;
    vat_kurus: number;
    invoice_count: number;
  }[];
  total_base_kurus: number;
  total_vat_kurus: number;
  invoice_count: number;
};

export type DeliverySalesReportRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  platforms: {
    delivery_platform_id: string;
    platform_name: string;
    is_active: boolean;
    gross_kurus: number;
    report_count: number;
  }[];
  total_gross_kurus: number;
};

export type PeriodComparisonRead = {
  entity_id: string;
  current_from: string;
  current_to: string;
  prior_from: string;
  prior_to: string;
  metrics: {
    key: string;
    label: string;
    current_kurus: number;
    prior_kurus: number;
    change_kurus: number;
    change_percent: number | null;
  }[];
};

export type TimeSeriesDailyPoint = {
  date: string;
  sales_kurus: number;
  expenses_kurus: number;
  net_kurus: number;
};

export type TimeSeriesRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  daily: TimeSeriesDailyPoint[];
  expenses_by_account: {
    account_id: string;
    account_code: string;
    account_name: string;
    total_kurus: number;
  }[];
  expenses_by_item: {
    expense_item_id: string;
    canonical_name: string;
    total_kurus: number;
  }[];
  spend_by_supplier: {
    supplier_id: string;
    supplier_name: string;
    total_kurus: number;
  }[];
};

export type ReportSlug =
  | "profit-and-loss"
  | "balance-sheet"
  | "cash-flow"
  | "kdv-input"
  | "delivery-sales"
  | "period-comparison";

export type ExpenseRegisterRow = {
  entry_date: string;
  account_id: string;
  account_code: string;
  account_name: string;
  description: string;
  source: string;
  amount_kurus: number;
  journal_entry_id: string;
};

export type ExpenseRegisterAccountTotal = {
  account_id: string;
  account_code: string;
  account_name: string;
  amount_kurus: number;
  entry_count: number;
};

export type ExpenseRegisterRead = {
  from_date: string;
  to_date: string;
  rows: ExpenseRegisterRow[];
  account_totals: ExpenseRegisterAccountTotal[];
  total_kurus: number;
  entry_count: number;
};

export type CashBookRow = {
  entry_date: string;
  description: string;
  source: string;
  in_kurus: number;
  out_kurus: number;
  balance_kurus: number;
  journal_entry_id: string;
};

export type CashBookSourceTotal = {
  source: string;
  in_kurus: number;
  out_kurus: number;
  entry_count: number;
};

export type CashBookLastCount = {
  session_date: string;
  expected_kurus: number;
  counted_kurus: number;
  over_short_kurus: number;
};

export type CashBookRead = {
  money_account_id: string;
  money_account_name: string;
  from_date: string;
  to_date: string;
  opening_kurus: number;
  total_in_kurus: number;
  total_out_kurus: number;
  closing_kurus: number;
  rows: CashBookRow[];
  source_totals: CashBookSourceTotal[];
  last_count: CashBookLastCount | null;
  counts: CashBookLastCount[];
};

export type UnreconciledLine = {
  id: string;
  statement_id: string;
  transaction_date: string;
  description: string;
  amount_kurus: number;
  status: string;
};

export type BankReconciliationAccount = {
  money_account_id: string;
  name: string;
  account_kind: string;
  book_balance_kurus: number;
  book_balance_as_of: string | null;
  imported_lines_total_kurus: number;
  unreconciled_count: number;
  unreconciled_total_kurus: number;
  statement_period_end: string | null;
  stated_closing_balance_kurus: number | null;
  missing_from_import_kurus: number | null;
  is_reconciled: boolean;
  latest_statement_id: string | null;
  lines: UnreconciledLine[];
};

export type BankReconciliationRead = {
  as_of: string | null;
  accounts: BankReconciliationAccount[];
};

export type PeriodLockRead = {
  id: string;
  entity_id: string;
  lock_kind: "day" | "month";
  period_start: string;
  period_end: string;
  closed_at: string;
  closed_by: string;
  reopened_at: string | null;
  reopened_by: string | null;
  /** Something was posted into this period after it was closed. */
  dirty: boolean;
};

export type ChangedEntry = {
  journal_entry_id: string;
  entry_date: string;
  description: string;
  source: string;
  status: string;
  amount_kurus: number;
  changed_at: string;
  /** "posted" — new entry in the month · "voided" — an original removed ·
   *  "reversal" — the void's other half. */
  change_kind: "posted" | "voided" | "reversal";
  reverses_entry_id: string | null;
};

export type UnlockReason = {
  actor_id: string;
  reason: string | null;
  created_at: string;
};

export type SealedMonthChangesRead = {
  lock_id: string;
  period_start: string;
  period_end: string;
  closed_at: string;
  dirty: boolean;
  entries: ChangedEntry[];
  reasons: UnlockReason[];
};

export type YearEndLine = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  balance_kurus: number;
};

export type YearEndPreviewRead = {
  year: number;
  closing_date: string;
  revenue_total_kurus: number;
  expense_total_kurus: number;
  net_result_kurus: number;
  lines: YearEndLine[];
  already_closed: boolean;
  journal_entry_id: string | null;
  december_closed: boolean;
  can_close: boolean;
};

export type ReadinessCheck = {
  key: string;
  label: string;
  severity: "block" | "warn";
  passed: boolean;
  detail: string;
  count: number;
  amount_kurus: number | null;
  href: string | null;
};

export type MonthCloseReadinessRead = {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  checks: ReadinessCheck[];
  can_close: boolean;
  warning_count: number;
  existing_lock: PeriodLockRead | null;
};
