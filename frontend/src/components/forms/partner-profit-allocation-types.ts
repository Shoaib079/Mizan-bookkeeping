/** Types for partner profit allocation preview / post. */

export type PartnerProfitPreviewLine = {
  partner_id: string;
  partner_name: string;
  ownership_share_pct: string;
  amount_kurus: number;
  gross_amount_kurus: number;
  net_balance_before_kurus: number;
  offset_kurus: number;
};

export type PartnerProfitPreviewResponse = {
  total_profit_kurus: number;
  total_allocated_kurus: number;
  net_against_drawings: boolean;
  netting_as_of?: string | null;
  lines: PartnerProfitPreviewLine[];
};

export type PartnerProfitPayload = {
  profit_kurus?: number;
  period_from?: string;
  period_to?: string;
};
