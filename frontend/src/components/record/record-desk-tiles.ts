/** Record desk v3 tile catalog — icons, tints, and grant action keys. */

import {
  ArrowLeftRight,
  Banknote,
  Calculator,
  CalendarCheck,
  CreditCard,
  Globe,
  ShoppingCart,
  Split,
  Upload,
  type LucideIcon,
} from "lucide-react";

import type { IconStroke, IconTint } from "@/components/ui/icon-square";
import type { RecordActionKey } from "@/lib/record-actions";

export type RecordDeskTileId =
  | "sales"
  | "expense"
  | "payment"
  | "transfer"
  | "split"
  | "fx"
  | "addDocument"
  | "countCash"
  | "closeDay";

export type RecordDeskTile = {
  id: RecordDeskTileId;
  label: string;
  /** Form panel H2 — distinct from the tile label to avoid duplicate chrome. */
  formTitle: string;
  hint: string;
  icon: LucideIcon;
  tint: IconTint;
  stroke: IconStroke;
  /** Grant / canUseRecordAction key. */
  actionKey: RecordActionKey;
};

/** Nine tiles, three per row — Salary lives under Payment → Staff. */
export const RECORD_DESK_TILES: readonly RecordDeskTile[] = [
  {
    id: "sales",
    label: "Sale",
    formTitle: "Record Sale",
    hint: "POS totals when you do not have a Z photo.",
    icon: Banknote,
    tint: "mint",
    stroke: "green",
    actionKey: "sales",
  },
  {
    id: "expense",
    label: "Expense",
    formTitle: "Record Expense",
    hint: "Cash or partner paid — bank and card on the statement.",
    icon: ShoppingCart,
    tint: "blush",
    stroke: "red",
    actionKey: "expense",
  },
  {
    id: "payment",
    label: "Payment",
    formTitle: "Record Payment",
    hint: "Staff, supplier, or customer — cash at the till; bank on the statement.",
    icon: CreditCard,
    tint: "mint",
    stroke: "green",
    actionKey: "staffPayment",
  },
  {
    id: "transfer",
    label: "Transfer",
    formTitle: "Record Transfer",
    hint: "Move money between bank and cash accounts.",
    icon: ArrowLeftRight,
    tint: "sky",
    stroke: "blue",
    actionKey: "transfer",
  },
  {
    id: "split",
    label: "Split",
    formTitle: "Record Split",
    hint: "Peel a personal share onto a partner from a posted expense.",
    icon: Split,
    tint: "sand",
    stroke: "amber",
    actionKey: "splitExpense",
  },
  {
    id: "fx",
    label: "FX",
    formTitle: "Record FX",
    hint: "",
    icon: Globe,
    tint: "gray",
    stroke: "gray",
    actionKey: "fx",
  },
  {
    id: "addDocument",
    label: "Upload",
    formTitle: "Upload document",
    hint: "Receipts, statements, invoices, Z reports — auto-routed.",
    icon: Upload,
    tint: "sky",
    stroke: "blue",
    actionKey: "addDocument",
  },
  {
    id: "countCash",
    label: "Count cash",
    formTitle: "Count cash",
    hint: "Count notes and compare to the books — does not post.",
    icon: Calculator,
    tint: "sand",
    stroke: "amber",
    actionKey: "countCash",
  },
  {
    id: "closeDay",
    label: "Close day",
    formTitle: "Close day",
    hint: "Post over/short, lock the day, optionally send cash elsewhere.",
    icon: CalendarCheck,
    tint: "mint",
    stroke: "green",
    actionKey: "closeDay",
  },
];
