/** Record hub / New menu / palette — action type definitions. */

import type { LucideIcon } from "lucide-react";

/** Modal shortcuts wired from New menu and command palette. */
export type QuickActionKey =
  | "expense"
  | "sales"
  | "fx"
  | "posPhoto"
  | "deliveryReport"
  | "receipt"
  | "supplier"
  | "efatura";

export type RecordActionKey =
  | QuickActionKey
  | "addDocument"
  | "countCash"
  | "closeDay"
  | "cashMovement"
  | "staffSalary"
  | "buyFx"
  | "fxConvert"
  | "fxSpend"
  | "transfer"
  | "bankStatement"
  | "cardSalesBatch"
  | "posSettlement"
  | "clearCommission"
  | "staffAccrual"
  | "staffAdvance"
  | "staffPayment"
  | "partnerProfitAllocation"
  | "splitExpense"
  | "customerCreditSale"
  | "customerPayment"
  | "supplierPayment";

export type RecordSectionId =
  | "today"
  | "upload"
  | "payments"
  | "occasional"
  | "salesCards";

export type PersonPickerKind = "staff" | "partner" | "customer" | "supplier";

export type RecordActionDef = {
  id: RecordActionKey;
  label: string;
  description: string;
  icon: LucideIcon;
  section: RecordSectionId;
  requiresDelivery?: boolean;
  /** Opens person picker before the form. */
  personKind?: PersonPickerKind;
  /** Hidden from hub grid and palette action list (still routable by key). */
  hidden?: boolean;
};
