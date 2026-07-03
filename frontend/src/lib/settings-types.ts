/** Settings & onboarding API shapes (Phase 9 Slice 9). */

export type EntitySettingRow = {
  id: string;
  entity_id: string;
  key: string;
  value: string;
  created_at: string;
};

export type MembershipRow = {
  id: string;
  entity_id: string;
  user_id: string;
  role: EntityRole;
  created_at: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    is_active: boolean;
    created_at: string;
  };
};

export type EntityRole = "owner" | "partner" | "cashier" | "partner_view_only";

export const ENTITY_ROLES: { value: EntityRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "partner", label: "Partner" },
  { value: "cashier", label: "Cashier" },
  { value: "partner_view_only", label: "Partner (view only)" },
];

export const KNOWN_ENTITY_SETTINGS = [
  {
    key: "invoice_supplier_auto_post",
    label: "Auto-post trusted supplier invoices",
    description:
      "When classification and expense account are both fully learned (HIGH), upload posts to the ledger automatically. Commission invoices and uncertain drafts always stay in review.",
  },
  {
    key: "delivery_enabled",
    label: "Delivery module",
    description: "Enable delivery platform reports, settlements, and reconciliation.",
  },
  {
    key: "card_tips_z_report_enabled",
    label: "Card-terminal Z report",
    description:
      "Require Z total on POS daily summary; mismatch sends to Needs Review.",
  },
] as const;

export type OpeningBalanceAccount = {
  code: string;
  name_en: string;
  name_tr: string;
  account_type: string;
  normal_balance: "debit" | "credit";
};

export type OpeningBalanceLineTarget =
  | "account"
  | "money_account"
  | "supplier"
  | "partner"
  | "customer";

export type OpeningBalanceLineDraft = {
  id: string;
  target: OpeningBalanceLineTarget;
  accountCode: string;
  side: "debit" | "credit" | "";
  moneyAccountId: string;
  supplierId: string;
  partnerId: string;
  customerId: string;
  amountTry: string;
};

export type JournalLineOut = {
  account_code: string;
  amount_kurus: number;
  side: "debit" | "credit";
};

export type OpeningBalanceValidateResponse = {
  valid: boolean;
  journal_lines: JournalLineOut[];
  message: string;
};

export type OpeningBalancePostResponse = {
  journal_entry_id: string;
  journal_lines: JournalLineOut[];
  go_live_date: string;
};
