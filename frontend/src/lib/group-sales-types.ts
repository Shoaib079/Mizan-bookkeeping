/** Group / agency sales API shapes (backend schema mirrors). */

export type GroupMenuRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type GroupSaleLineRead = {
  id: string;
  group_menu_id: string | null;
  menu_name_snapshot: string;
  pax: number;
  rate_per_person_minor: number;
  line_total_minor: number;
  line_total_kurus: number;
};

export type GroupSaleRead = {
  id: string;
  customer_id: string;
  sale_date: string;
  description: string;
  currency: string;
  status: "posted" | "voided" | "amended" | string;
  total_kurus: number;
  forex_currency: string | null;
  total_forex_minor: number | null;
  fx_rate_used: number | null;
  journal_entry_id: string | null;
  customer_ledger_entry_id: string | null;
  amends_group_sale_id: string | null;
  amended_by_group_sale_id: string | null;
  actor_id: string | null;
  created_at: string;
  lines: GroupSaleLineRead[];
  remaining_kurus: number | null;
  remaining_forex_minor: number | null;
};

export type GroupSaleLineInput = {
  group_menu_id?: string | null;
  menu_name?: string | null;
  pax: number;
  rate_per_person_minor: number;
};

export type GroupSaleCreatePayload = {
  customer_id: string;
  sale_date: string;
  description: string;
  currency: string;
  lines: GroupSaleLineInput[];
  actor_id?: string | null;
  fx_rate_used?: number | null;
  total_kurus?: number | null;
};

export type GroupSalePostResponse = {
  group_sale: GroupSaleRead;
  balance_kurus: number;
  balance_forex_minor: number | null;
  balance_forex_currency: string | null;
};

export const FOREX_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type ForexCurrency = (typeof FOREX_CURRENCIES)[number];
