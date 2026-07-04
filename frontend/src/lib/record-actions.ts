/** Record hub + New menu + command palette — single action source (UX1). */

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  CalendarCheck,
  CreditCard,
  FileText,
  HandCoins,
  Handshake,
  Landmark,
  Receipt,
  ShoppingBag,
  Upload,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";

/** Modal shortcuts wired from New menu and command palette. */
export type QuickActionKey =
  | "expense"
  | "sales"
  | "buyFx"
  | "posPhoto"
  | "deliveryReport"
  | "receipt"
  | "supplier"
  | "efatura";

export type RecordActionKey =
  | QuickActionKey
  | "addDocument"
  | "closeDay"
  | "cashMovement"
  | "transfer"
  | "fxConvert"
  | "fxSpend"
  | "bankStatement"
  | "cardSalesBatch"
  | "posSettlement"
  | "clearCommission"
  | "staffAccrual"
  | "staffAdvance"
  | "staffPayment"
  | "partnerExpenseFronted"
  | "partnerReimbursement"
  | "partnerDrawing"
  | "partnerDrawingRepayment"
  | "partnerProfitAllocation"
  | "customerCreditSale"
  | "customerPayment"
  | "supplierPayment";

export type RecordSectionId =
  | "today"
  | "upload"
  | "cashFx"
  | "salesCards"
  | "people"
  | "suppliers";

export type PersonPickerKind = "staff" | "partner" | "customer" | "supplier";

export type RecordActionDef = {
  id: RecordActionKey;
  label: string;
  description: string;
  icon: LucideIcon;
  section: RecordSectionId;
  /** Hidden under collapsible "Advanced" in Sales & cards. */
  advanced?: boolean;
  requiresDelivery?: boolean;
  /** Opens person picker before the form. */
  personKind?: PersonPickerKind;
  /** Hidden from hub grid and palette action list (still routable by key). */
  hidden?: boolean;
};

export const RECORD_SECTION_LABELS: Record<RecordSectionId, string> = {
  today: "Today",
  upload: "Upload & extract",
  cashFx: "Cash & FX",
  salesCards: "Sales & cards",
  people: "People",
  suppliers: "Suppliers",
};

export const RECORD_ACTIONS: RecordActionDef[] = [
  {
    id: "closeDay",
    label: "Close day",
    description: "Count the drawer and post over/short for a business day.",
    icon: CalendarCheck,
    section: "today",
  },
  {
    id: "sales",
    label: "Daily sales (manual)",
    description: "Enter POS totals when you do not have a Z photo.",
    icon: ShoppingBag,
    section: "today",
  },
  {
    id: "expense",
    label: "Manual expense",
    description: "Pay from cash or record a partner-fronted expense.",
    icon: Wallet,
    section: "today",
  },
  {
    id: "addDocument",
    label: "Add document",
    description: "Drop any file — auto-detected and routed to the right form.",
    icon: Upload,
    section: "upload",
  },
  {
    id: "posPhoto",
    label: "POS summary (photo)",
    description: "Upload a Z report photo for OCR review.",
    icon: ShoppingBag,
    section: "upload",
    hidden: true,
  },
  {
    id: "receipt",
    label: "Expense receipt (photo)",
    description: "Upload a receipt photo for OCR review.",
    icon: Receipt,
    section: "upload",
    hidden: true,
  },
  {
    id: "efatura",
    label: "Supplier invoice (e-Fatura)",
    description: "Upload an e-Fatura PDF into a draft invoice.",
    icon: FileText,
    section: "upload",
    hidden: true,
  },
  {
    id: "deliveryReport",
    label: "Delivery report",
    description: "Upload a platform sales report for review.",
    icon: Upload,
    section: "upload",
    requiresDelivery: true,
  },
  {
    id: "bankStatement",
    label: "Bank statement",
    description: "Import a CSV bank export for line review.",
    icon: Landmark,
    section: "upload",
    hidden: true,
  },
  {
    id: "cashMovement",
    label: "Cash movement",
    description: "Pay in or pay out of a cash drawer.",
    icon: Wallet,
    section: "cashFx",
  },
  {
    id: "buyFx",
    label: "Buy foreign currency",
    description: "Purchase USD, EUR, or GBP into an FX wallet.",
    icon: Banknote,
    section: "cashFx",
  },
  {
    id: "fxConvert",
    label: "Convert FX to TRY",
    description: "Sell foreign currency back to lira.",
    icon: Banknote,
    section: "cashFx",
  },
  {
    id: "fxSpend",
    label: "Spend from FX wallet",
    description: "Pay an expense directly from a foreign currency wallet.",
    icon: Banknote,
    section: "cashFx",
  },
  {
    id: "transfer",
    label: "Transfer",
    description: "Move money between bank and cash accounts.",
    icon: ArrowLeftRight,
    section: "cashFx",
  },
  {
    id: "cardSalesBatch",
    label: "Card sales batch",
    description: "Record card takings before settlement clears.",
    icon: CreditCard,
    section: "salesCards",
    advanced: true,
  },
  {
    id: "posSettlement",
    label: "POS settlement",
    description: "Record card processor deposit to the bank.",
    icon: CreditCard,
    section: "salesCards",
    advanced: true,
  },
  {
    id: "clearCommission",
    label: "Clear bank commission",
    description: "Reconcile bank commission against clearing.",
    icon: CreditCard,
    section: "salesCards",
    advanced: true,
  },
  {
    id: "staffAccrual",
    label: "Staff salary accrual",
    description: "Accrue salary owed to an employee.",
    icon: Users,
    section: "people",
    personKind: "staff",
  },
  {
    id: "staffAdvance",
    label: "Staff advance",
    description: "Pay an advance from cash or FX wallet.",
    icon: Users,
    section: "people",
    personKind: "staff",
  },
  {
    id: "staffPayment",
    label: "Staff salary payment",
    description: "Pay salary from cash or FX wallet.",
    icon: Users,
    section: "people",
    personKind: "staff",
  },
  {
    id: "partnerExpenseFronted",
    label: "Partner expense (fronted)",
    description: "Partner paid a business expense from personal funds.",
    icon: Handshake,
    section: "people",
    personKind: "partner",
  },
  {
    id: "partnerReimbursement",
    label: "Partner reimbursement",
    description: "Repay a partner for fronted expenses.",
    icon: Handshake,
    section: "people",
    personKind: "partner",
  },
  {
    id: "partnerDrawing",
    label: "Partner drawing",
    description: "Partner withdraws cash — they owe the business.",
    icon: Handshake,
    section: "people",
    personKind: "partner",
  },
  {
    id: "partnerDrawingRepayment",
    label: "Partner drawing repayment",
    description: "Partner repays an outstanding drawing.",
    icon: Handshake,
    section: "people",
    personKind: "partner",
  },
  {
    id: "partnerProfitAllocation",
    label: "Allocate profit to partners",
    description: "Distribute net profit to partners by ownership share.",
    icon: Handshake,
    section: "people",
  },
  {
    id: "customerCreditSale",
    label: "Customer credit sale",
    description: "Record a sale on customer account.",
    icon: UserCircle,
    section: "people",
    personKind: "customer",
  },
  {
    id: "customerPayment",
    label: "Customer payment",
    description: "Collect payment against customer balance.",
    icon: UserCircle,
    section: "people",
    personKind: "customer",
  },
  {
    id: "supplier",
    label: "New supplier",
    description: "Add a supplier to the directory.",
    icon: Users,
    section: "suppliers",
  },
  {
    id: "supplierPayment",
    label: "Record supplier payment",
    description: "Pay a supplier from bank or cash.",
    icon: HandCoins,
    section: "suppliers",
    personKind: "supplier",
  },
];

export const QUICK_ACTION_KEYS = new Set<QuickActionKey>([
  "expense",
  "sales",
  "buyFx",
  "posPhoto",
  "deliveryReport",
  "receipt",
  "supplier",
  "efatura",
]);

export function isQuickActionKey(key: RecordActionKey): key is QuickActionKey {
  return QUICK_ACTION_KEYS.has(key as QuickActionKey);
}

export const PERSON_PICKER_ACTIONS = new Set<RecordActionKey>(
  RECORD_ACTIONS.filter((action) => action.personKind).map((action) => action.id),
);

export function recordActionById(id: RecordActionKey): RecordActionDef {
  const action = RECORD_ACTIONS.find((entry) => entry.id === id);
  if (!action) throw new Error(`Unknown record action: ${id}`);
  return action;
}

export function filterRecordActions(
  actions: RecordActionDef[],
  opts: { deliveryEnabled: boolean },
): RecordActionDef[] {
  return actions.filter(
    (action) => !action.requiresDelivery || opts.deliveryEnabled,
  );
}

export function recordActionsBySection(
  section: RecordSectionId,
  opts: { deliveryEnabled: boolean },
): RecordActionDef[] {
  return filterRecordActions(
    RECORD_ACTIONS.filter((action) => action.section === section && !action.hidden),
    opts,
  );
}

