"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useQuickActions } from "@/components/quick-actions";
import type { NavSectionId } from "@/lib/nav-sections";
import { navSectionById } from "@/lib/nav-sections";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

type SectionTabsProps = {
  sectionId: NavSectionId;
  ariaLabel: string;
};

export function SectionTabs({ sectionId, ariaLabel }: SectionTabsProps) {
  const pathname = usePathname();
  const { deliveryEnabled } = useQuickActions();
  const { canReadFinancialReports } = useEntityAccess();
  const section = navSectionById(sectionId);
  const tabs = section.tabs.filter((tab) => {
    if (tab.requiresDelivery && !deliveryEnabled) return false;
    if (tab.requiresFinancialReports && !canReadFinancialReports) return false;
    return true;
  });

  return (
    <div
      className="mb-4 flex flex-wrap gap-1 border-b border-border"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "-mb-px rounded-t-md border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
              active &&
                "border-border border-b-background bg-background text-primary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
