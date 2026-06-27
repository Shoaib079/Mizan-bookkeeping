"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const DELIVERY_TABS = [
  { href: "/delivery", label: "Overview", match: (path: string) => path === "/delivery" },
  {
    href: "/delivery/platforms",
    label: "Platforms",
    match: (path: string) => path === "/delivery/platforms",
  },
  {
    href: "/delivery/reports",
    label: "Reports",
    match: (path: string) => path.startsWith("/delivery/reports"),
  },
  {
    href: "/delivery/settlements",
    label: "Settlements",
    match: (path: string) => path === "/delivery/settlements",
  },
] as const;

export function DeliveryTabs() {
  const pathname = usePathname();

  return (
    <div
      className="mb-4 flex flex-wrap gap-1 border-b border-border"
      role="tablist"
      aria-label="Delivery sections"
    >
      {DELIVERY_TABS.map((tab) => {
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
