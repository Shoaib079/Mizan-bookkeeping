/** Record hub + New menu + command palette — single action source (UX1). */

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Calculator,
  CalendarCheck,
  CreditCard,
  FileText,
  HandCoins,
  Handshake,
  Landmark,
  Receipt,
  Scissors,
  ShoppingBag,
  Upload,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";

import { canUseRecordAction } from "@/lib/entity-access";

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

export const RECORD_SECTION_LABELS: Record<RecordSectionId, string> = {
  today: "Every day",
  upload: "Upload",
  payments: "Partner cash",
  occasional: "Less often",
  salesCards: "Sales & cards",
};

/** Primary Add hub cards — one click, no digging. */
export const PRIMARY_RECORD_ACTION_IDS = [
  "sales",
  "expense",
  "staffSalary",
  "fx",
  "addDocument",
  "countCash",
  "closeDay",
] as const satisfies readonly RecordActionKey[];

export type PrimaryRecordActionId = (typeof PRIMARY_RECORD_ACTION_IDS)[number];

/** Always-visible sections below the primary row (Add → More menu). */
const DAILY_VISIBLE_SECTIONS: RecordSectionId[] = ["payments"];

export const RECORD_ACTIONS: RecordActionDef[] = [
  {
    id: "expense",
    label: "Daily expenses",
    description: "Cash or partner paid — groceries, supplies, petty cash. Bank/card on the statement.",
    icon: Wallet,
    section: "today",
  },
  {
    id: "staffSalary",
    label: "Staff salary",
    description: "Pay salary from cash or a partner (owe them). Accruals on Staff.",
    icon: Users,
    section: "today",
  },
  {
    id: "sales",
    label: "Daily sales",
    description: "POS totals when you do not have a Z photo.",
    icon: ShoppingBag,
    section: "today",
  },
  {
    id: "fx",
    label: "Foreign exchange",
    description: "Buy, sell, or spend USD, EUR, or GBP.",
    icon: Banknote,
    section: "today",
  },
  {
    id: "addDocument",
    label: "Upload",
    description:
      "Receipts, bank or card statements, invoices, Z reports — one drop zone, auto-routed.",
    icon: Upload,
    section: "today",
  },
  {
    id: "countCash",
    label: "Count cash",
    description:
      "Count notes and compare to the books — saves on this device until Close day.",
    icon: Calculator,
    section: "today",
  },
  {
    id: "closeDay",
    label: "Close day",
    description:
      "Post the counted total, over/short, and lock the drawer day. Optionally send cash to another drawer after.",
    icon: CalendarCheck,
    section: "today",
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
    description: "Platform sales report for review.",
    icon: Upload,
    section: "upload",
    requiresDelivery: true,
    hidden: true,
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
    label: "Cash in / out",
    description: "Move cash into or out of the drawer.",
    icon: Wallet,
    section: "payments",
    hidden: true,
  },
  {
    id: "staffAdvance",
    label: "Staff advance",
    description: "Pay an advance from cash or FX wallet.",
    icon: Users,
    section: "payments",
    personKind: "staff",
    hidden: true,
  },
  {
    id: "splitExpense",
    label: "Split",
    description:
      "Peel personal share off a posted bank expense (SGK, rent…) onto a partner.",
    icon: Scissors,
    section: "payments",
  },
  {
    id: "supplierPayment",
    label: "Pay supplier (cash)",
    description: "Cash at delivery — bank payments come from the statement.",
    icon: HandCoins,
    section: "payments",
    personKind: "supplier",
    hidden: true,
  },
  {
    id: "customerPayment",
    label: "Customer payment",
    description: "Collect cash or FX against customer balance.",
    icon: UserCircle,
    section: "payments",
    personKind: "customer",
    hidden: true,
  },
  {
    id: "buyFx",
    label: "Buy foreign currency",
    description: "Purchase USD, EUR, or GBP into an FX wallet.",
    icon: Banknote,
    section: "occasional",
    hidden: true,
  },
  {
    id: "fxConvert",
    label: "Convert FX to TRY",
    description: "Sell foreign currency back to lira.",
    icon: Banknote,
    section: "occasional",
    hidden: true,
  },
  {
    id: "fxSpend",
    label: "Spend from FX wallet",
    description: "Pay an expense directly from a foreign currency wallet.",
    icon: Banknote,
    section: "occasional",
    hidden: true,
  },
  {
    id: "transfer",
    label: "Transfer",
    description: "Move money between bank and cash accounts.",
    icon: ArrowLeftRight,
    section: "occasional",
    hidden: true,
  },
  {
    id: "cardSalesBatch",
    label: "Card sales batch",
    description: "Record card takings before settlement clears.",
    icon: CreditCard,
    section: "salesCards",
    hidden: true,
  },
  {
    id: "posSettlement",
    label: "POS settlement",
    description: "Record card processor deposit to the bank.",
    icon: CreditCard,
    section: "salesCards",
    hidden: true,
  },
  {
    id: "clearCommission",
    label: "Clear bank commission",
    description: "Reconcile bank commission against clearing.",
    icon: CreditCard,
    section: "salesCards",
    hidden: true,
  },
  {
    id: "staffAccrual",
    label: "Staff salary accrual",
    description: "Accrue salary owed — usually once a month.",
    icon: Users,
    section: "occasional",
    personKind: "staff",
    hidden: true,
  },
  {
    id: "staffPayment",
    label: "Staff salary payment",
    description: "Pay salary from cash or FX wallet.",
    icon: Users,
    section: "occasional",
    personKind: "staff",
    hidden: true,
  },
  {
    id: "partnerProfitAllocation",
    label: "Allocate profit to partners",
    description: "Distribute net profit by ownership share.",
    icon: Handshake,
    section: "occasional",
    hidden: true,
  },
  {
    id: "customerCreditSale",
    label: "Customer group sale",
    description: "Group or credit sale on customer account.",
    icon: UserCircle,
    section: "occasional",
    personKind: "customer",
    hidden: true,
  },
  {
    id: "supplier",
    label: "New supplier",
    description: "Add a supplier to the directory.",
    icon: Users,
    section: "occasional",
    hidden: true,
  },
];

const QUICK_ACTION_KEYS = new Set<QuickActionKey>([
  "expense",
  "sales",
  "fx",
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
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  return actions.filter((action) => {
    if (opts.grants && !canUseRecordAction(opts.grants, action.id)) return false;
    return !action.requiresDelivery || opts.deliveryEnabled;
  });
}

export function primaryRecordActions(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  const available = filterRecordActions(RECORD_ACTIONS, opts);
  return PRIMARY_RECORD_ACTION_IDS.map((id) =>
    available.find((action) => action.id === id),
  ).filter((action): action is RecordActionDef => action !== undefined);
}

export function recordActionsBySection(
  section: RecordSectionId,
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  const primary = new Set<RecordActionKey>(PRIMARY_RECORD_ACTION_IDS);
  return filterRecordActions(
    RECORD_ACTIONS.filter(
      (action) =>
        action.section === section &&
        !action.hidden &&
        !primary.has(action.id),
    ),
    opts,
  );
}

export function dailyVisibleSections(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): { section: RecordSectionId; actions: RecordActionDef[] }[] {
  return DAILY_VISIBLE_SECTIONS.map((section) => ({
    section,
    actions: recordActionsBySection(section, opts),
  })).filter((entry) => entry.actions.length > 0);
}

export function occasionalRecordActions(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  return recordActionsBySection("occasional", opts);
}
