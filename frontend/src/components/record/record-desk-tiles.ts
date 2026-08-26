/** Record desk v3 tile catalog — icons, tints, and grant action keys. */

import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  CreditCard,
  Globe,
  ShoppingCart,
  Split,
  type LucideIcon,
} from "lucide-react";

import type { IconStroke, IconTint } from "@/components/ui/icon-square";
import type { RecordActionKey } from "@/lib/record-actions";

export type RecordDeskTileId =
  | "sales"
  | "expense"
  | "staffSalary"
  | "payment"
  | "transfer"
  | "split"
  | "fx";

export type RecordDeskTile = {
  id: RecordDeskTileId;
  label: string;
  hint: string;
  icon: LucideIcon;
  tint: IconTint;
  stroke: IconStroke;
  /** Grant / canUseRecordAction key (payment maps to customerPayment). */
  actionKey: RecordActionKey;
};

export const RECORD_DESK_TILES: readonly RecordDeskTile[] = [
  {
    id: "sales",
    label: "Sale",
    hint: "POS totals when you do not have a Z photo.",
    icon: Banknote,
    tint: "mint",
    stroke: "green",
    actionKey: "sales",
  },
  {
    id: "expense",
    label: "Expense",
    hint: "Cash or partner paid — bank and card on the statement.",
    icon: ShoppingCart,
    tint: "blush",
    stroke: "red",
    actionKey: "expense",
  },
  {
    id: "staffSalary",
    label: "Salary",
    hint: "Pay from cash or a partner (owe them) — accruals on Staff.",
    icon: Briefcase,
    tint: "sky",
    stroke: "blue",
    actionKey: "staffSalary",
  },
  {
    id: "payment",
    label: "Payment",
    hint: "Customer, supplier, or staff payment.",
    icon: CreditCard,
    tint: "mint",
    stroke: "green",
    actionKey: "customerPayment",
  },
  {
    id: "transfer",
    label: "Transfer",
    hint: "Move money between bank and cash accounts.",
    icon: ArrowLeftRight,
    tint: "sky",
    stroke: "blue",
    actionKey: "transfer",
  },
  {
    id: "split",
    label: "Split",
    hint: "Peel a personal share onto a partner from a posted expense.",
    icon: Split,
    tint: "sand",
    stroke: "amber",
    actionKey: "splitExpense",
  },
  {
    id: "fx",
    label: "FX",
    hint: "Buy, sell, or spend USD, EUR, or GBP.",
    icon: Globe,
    tint: "gray",
    stroke: "gray",
    actionKey: "fx",
  },
] as const;

/** Upload / count / close stay reachable from More (not in the v3 grid). */
export const RECORD_DESK_EXTRA_ACTION_IDS = [
  "addDocument",
  "countCash",
  "closeDay",
] as const satisfies readonly RecordActionKey[];
