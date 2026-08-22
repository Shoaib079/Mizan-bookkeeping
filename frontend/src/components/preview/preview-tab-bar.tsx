"use client";

import {
  LayoutDashboard,
  Menu,
  Plus,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import {
  selectPreviewTab,
  type PreviewTab,
} from "@/lib/preview-nav";
import { cn } from "@/lib/utils";

const TABS: {
  id: PreviewTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fab?: boolean;
}[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "sales", label: "Sales", icon: ShoppingBag },
  { id: "record", label: "Record", icon: Plus, fab: true },
  { id: "balances", label: "Balances", icon: Wallet },
  { id: "more", label: "More", icon: Menu },
];

export function PreviewTabBar({
  active,
  onSelect,
}: {
  active: PreviewTab;
  onSelect: (tab: PreviewTab) => void;
}) {
  return (
    <nav
      aria-label="Preview tab bar"
      className="shrink-0 border-t border-border bg-[var(--tab-bar-bg)]"
    >
      <div className="flex items-end px-1 pb-2 pt-3">
        {TABS.map((tab) => {
          if (tab.fab) {
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-label="Record"
                aria-current={selected ? "page" : undefined}
                className="relative flex flex-[1.15] flex-col items-center justify-end pb-1.5 pt-0"
                onClick={() => selectPreviewTab(tab.id, onSelect)}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background",
                    "size-[var(--record-fab-size)] -mt-5 shadow-[var(--record-fab-shadow)]",
                    selected && "ring-primary/20",
                  )}
                >
                  <Plus className="size-7 stroke-[2.5]" />
                </span>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-semibold",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  Record
                </span>
              </button>
            );
          }

          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium transition-colors",
                selected
                  ? "text-[var(--tab-active-fg,var(--primary))]"
                  : "text-muted-foreground",
              )}
              onClick={() => selectPreviewTab(tab.id, onSelect)}
            >
              <span
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] px-[var(--tab-active-padding-x)] py-0.5",
                  selected && "bg-[var(--tab-active-bg)]",
                )}
              >
                <Icon className={cn("size-[18px]", selected && "scale-105")} />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
