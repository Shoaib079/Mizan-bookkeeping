/** Types and labels for PartnerRecordForm. */

export type PartnerRecordKind =
  | "cash"
  | "profit_paid"
  | "capital"
  | "returned";

export type PartnerRecordFormProps = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  netBalanceKurus?: number;
  /** Kept for call-site compatibility; cash Record shows net only (no fronted breakdown). */
  frontedBalanceKurus?: number;
  unpaidProfitKurus?: number;
  /** Outstanding drawings net — negative means repayable. */
  drawingsNetKurus?: number;
  /** When set, skip type picker (e.g. dedicated Pay profit button). */
  lockedKind?: PartnerRecordKind;
  embedded?: boolean;
  onSaved?: () => void;
};

export const PARTNER_RECORD_KIND_LABELS: Record<PartnerRecordKind, string> = {
  cash: "Cash taken / withdrawn",
  profit_paid: "Pay profit",
  capital: "Capital in",
  returned: "Partner returned cash",
};
