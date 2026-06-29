"use client";

/** New dropdown — grouped quick actions (Slice 11.14). */

import Link from "next/link";
import {
  Banknote,
  ChevronDown,
  FileText,
  Plus,
  Receipt,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";

import { useQuickActions, type QuickActionKey } from "@/components/quick-actions";
import { Button } from "@/components/ui/button";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { shouldShowNewMenu } from "@/lib/entity-access";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

type MenuItem = {
  key?: QuickActionKey;
  href?: string;
  label: string;
  icon: typeof Wallet;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Sales",
    items: [
      { key: "sales", label: "Daily sales (manual)", icon: ShoppingBag },
      { key: "posPhoto", label: "POS summary (photo)", icon: ShoppingBag },
      { key: "deliveryReport", label: "Delivery report", icon: Truck },
    ],
  },
  {
    label: "Expenses",
    items: [
      { key: "expense", label: "Manual expense", icon: Wallet },
      { key: "receipt", label: "Expense receipt (photo)", icon: Receipt },
    ],
  },
  {
    label: "Cash & bank",
    items: [{ key: "buyFx", label: "Buy foreign currency", icon: Banknote }],
  },
  {
    label: "Suppliers",
    items: [
      { key: "supplier", label: "Supplier", icon: Users },
      { key: "efatura", label: "Supplier invoice (e-Fatura)", icon: FileText },
    ],
  },
];

function MenuSectionHeader({ label }: { label: string }) {
  return (
    <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground first:pt-1">
      {label}
    </p>
  );
}

export function NewMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { openQuickAction, deliveryEnabled } = useQuickActions();
  const { role } = useEntityAccess();

  useDismissOnOutsideClick(menuRef, open, () => setOpen(false));

  if (!shouldShowNewMenu(role)) {
    return (
      <div className="px-3 pb-3">
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          View only — use Reports to review figures.
        </p>
      </div>
    );
  }

  function pickItem(item: MenuItem) {
    if (!item.key) return;
    setOpen(false);
    openQuickAction(item.key);
  }

  const groups: MenuGroup[] = [
    {
      label: "Operations",
      items: [{ href: "/close-day", label: "Close day", icon: ShoppingBag }],
    },
    ...MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.key !== "deliveryReport" || deliveryEnabled,
      ),
    })),
  ].filter((group) => group.items.length > 0);

  return (
    <div ref={menuRef} className="relative px-3 pb-3">
      <Button
        className="w-full justify-between"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" />
          New
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </Button>
      {open && (
        <div
          className="absolute left-3 right-3 top-full z-20 mt-1 max-h-[min(24rem,70vh)] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
          role="menu"
        >
          {groups.map((group, groupIndex) => (
            <div key={group.label}>
              {groupIndex > 0 && (
                <div className="mx-3 my-1 border-t border-border" aria-hidden />
              )}
              <MenuSectionHeader label={group.label} />
              {group.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
                    onClick={() => setOpen(false)}
                  >
                    <item.icon className="size-4 text-primary" />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
                    onClick={() => pickItem(item)}
                  >
                    <item.icon className="size-4 text-primary" />
                    {item.label}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
