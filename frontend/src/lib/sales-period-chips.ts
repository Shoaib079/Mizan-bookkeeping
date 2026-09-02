/** Types for GET …/reports/sales-summary (posted 4000 totals). */

/** One column from the sales-summary API. */
export type SalesSummaryColumnRead = {
  from_date: string;
  to_date: string;
  full_month: boolean;
  cash_kurus: number;
  card_kurus: number;
  delivery_kurus: number;
  total_kurus: number;
};

export type SalesSummaryRead = {
  entity_id: string;
  delivery_enabled: boolean;
  current: SalesSummaryColumnRead;
  prior: SalesSummaryColumnRead;
};
