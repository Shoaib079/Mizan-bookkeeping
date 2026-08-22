/** Group / agency sales API shapes (backend schema mirrors). */

export type MenuCategory = "veg" | "jain" | "non_veg" | "special" | "catering";

/** The document's own grouping, in its own order. */
export const MENU_CATEGORIES: { value: MenuCategory; label: string }[] = [
  { value: "veg", label: "Vegetarian" },
  { value: "jain", label: "Jain" },
  { value: "non_veg", label: "Non-vegetarian" },
  { value: "special", label: "Special" },
  { value: "catering", label: "Catering" },
];

export type GroupMenuLineRow = {
  id: string;
  dish_id: string;
  dish_name: string;
  dish_description: string | null;
  dish_description_tr: string | null;
  sort_order: number;
  note: string | null;
};

export type GroupMenuRow = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number | null;
  currency: string;
  surcharge_minor: number | null;
  surcharge_label: string | null;
  price_excludes_vat: boolean;
  category: MenuCategory | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  /** Empty on the list, filled on the detail read. */
  lines: GroupMenuLineRow[];
  line_count: number;
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

export type GroupSaleDiscountRead = {
  customer_ledger_entry_id: string;
  discount_native_minor: number;
  description: string;
  movement_date: string;
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
  discounts?: GroupSaleDiscountRead[];
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
