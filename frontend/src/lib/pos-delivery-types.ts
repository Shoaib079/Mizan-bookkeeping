/** POS & delivery API shapes — Phase 9 Slice 5. */

export type PosDailySummary = {
  id: string;
  status: string;
  summary_date: string | null;
  cash_kurus: number;
  card_kurus: number;
  total_kurus: number;
  z_report_kurus: number | null;
  confirmed_cash_kurus: number | null;
  confirmed_card_kurus: number | null;
  extraction_payload: Record<string, unknown>;
  review_reason: string | null;
  money_account_id: string | null;
};

export type CardSalesBatch = {
  id: string;
  sales_date: string;
  gross_amount_kurus: number;
  description: string;
  created_at: string;
};

export type PosSettlement = {
  id: string;
  settlement_date: string;
  amount_kurus: number;
  commission_kurus: number | null;
  description: string;
  money_account_id: string;
  /** "posted" | "voided" — derived from the linked journal entry (phase 5). */
  status: string;
  created_at: string;
};

export type ClearingReconciliation = {
  clearing_balance_kurus: number;
  total_card_sales_kurus: number;
  total_settled_gross_kurus: number;
  in_transit_kurus: number;
  card_sales_batch_count: number;
  pos_settlement_count: number;
};

export type DeliveryPlatform = {
  id: string;
  name: string;
  gl_account_code: string;
  is_active: boolean;
};

export type DeliveryReport = {
  id: string;
  delivery_platform_id: string;
  platform_name: string;
  report_date: string;
  period_start: string;
  period_end: string;
  period_year: number;
  period_month: number;
  gross_kurus: number;
  status: string;
  review_reason: string | null;
  description: string;
};

export type DeliverySettlement = {
  id: string;
  delivery_platform_id: string;
  platform_name: string;
  settlement_date: string;
  amount_kurus: number;
  description: string;
  money_account_id: string;
  /** "posted" | "voided" — derived from the linked journal entry (phase 5). */
  status: string;
  created_at: string;
};

export type PlatformClearingReconciliation = {
  delivery_platform_id: string;
  platform_name: string;
  clearing_account_code: string;
  is_active: boolean;
  clearing_balance_kurus: number;
  total_reported_gross_kurus: number;
  total_settled_net_kurus: number;
  total_commission_posted_kurus: number;
  balance_left_kurus: number;
  monthly_sales_count: number;
  settlement_count: number;
  commission_posted_count: number;
};

export type DeliveryClearingReconciliation = {
  platforms: PlatformClearingReconciliation[];
};

export type MoneyAccountOption = { id: string; name: string };
