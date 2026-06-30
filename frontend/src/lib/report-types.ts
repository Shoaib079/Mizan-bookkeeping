/** Report + dashboard API shapes (backend schema mirrors). */

export type DashboardRead = {
  entity_id: string;
  from_date: string;
  to_date: string;
  sales: {
    cash_sales_kurus: number;
    pos_card_sales_kurus: number;
    delivery_sales_kurus: number;
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
  delivery_in_transit: {
    delivery_platform_id: string;
    platform_name: string;
    clearing_balance_kurus: number;
  }[];
  total_try_position_kurus: number;
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

export type ReportSlug =
  | "profit-and-loss"
  | "balance-sheet"
  | "cash-flow"
  | "kdv-input"
  | "delivery-sales"
  | "period-comparison";
