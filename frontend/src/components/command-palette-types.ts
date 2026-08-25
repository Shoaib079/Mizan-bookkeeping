/** Row union for the ⌘K command palette. */

import type { ComponentType } from "react";

import type { RecordActionDef } from "@/lib/record-actions";
import type {
  PaletteCustomer,
  PaletteExpenseItem,
  PaletteSupplier,
} from "@/lib/palette-search";

export type CommandPaletteProps = {
  deliveryEnabled: boolean;
};

export type PaletteRow =
  | { kind: "supplier"; supplier: PaletteSupplier }
  | { kind: "customer"; customer: PaletteCustomer }
  | { kind: "item"; item: PaletteExpenseItem }
  | {
      kind: "page";
      label: string;
      href: string;
      icon: ComponentType<{ className?: string }>;
      group: string;
    }
  | { kind: "action"; action: RecordActionDef };
