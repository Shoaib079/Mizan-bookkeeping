export type ExpenseCandidate = {
  expense_id: string;
  expense_date: string;
  description: string;
  amount_kurus: number;
  remaining_splittable_kurus: number;
};

export type PaymentCandidate = {
  supplier_ledger_entry_id: string;
  supplier_name: string;
  payment_date: string;
  description: string;
  amount_kurus: number;
  remaining_splittable_kurus: number;
};

export type PartnerRow = { id: string; name: string; is_active: boolean };

export type SourceTab = "bank_expense" | "supplier_payment";

export type Selected =
  | { kind: "bank_expense"; id: string }
  | { kind: "supplier_payment"; id: string }
  | null;
