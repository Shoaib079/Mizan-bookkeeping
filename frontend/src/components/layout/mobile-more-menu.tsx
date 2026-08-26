"use client";

/** Mobile More hub — one flat nav list with label search. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Settings } from "lucide-react";

import { MobileEntitySwitcher } from "@/components/layout/mobile-entity-switcher";
import { Input } from "@/components/ui/input";
import {
  appRoutes,
  filterNavItemsByEntitySettings,
  type AppRoute,
} from "@/lib/app-routes";
import { hasGrant } from "@/lib/entity-access";
import { useQuickActions } from "@/components/quick-actions";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

/** Flat More destinations (Sales lives on the bottom tab bar). */
export const MORE_NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/delivery", label: "Delivery" },
  { href: "/customers", label: "Customers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/staff", label: "Staff" },
  { href: "/partners", label: "Partners" },
  { href: "/cards", label: "Cards" },
  { href: "/reports", label: "Reports" },
];

export function matchesMoreNavSearch(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

function routeForHref(href: string): AppRoute | undefined {
  return appRoutes.find((r) => r.href === href);
}

function MoreRow({
  href,
  label,
  icon: Icon,
  mutedIcon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  mutedIcon?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 last:border-b-0 active:bg-muted/60"
    >
      <span
        className={cn(
          "flex size-[34px] shrink-0 items-center justify-center rounded-[10px]",
          mutedIcon ? "bg-muted" : "bg-primary/10 text-primary",
        )}
      >
        <Icon
          className={cn(
            "size-4",
            mutedIcon && "text-muted-foreground",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 text-base">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

function hasLimitedMoreMenu(grants: readonly string[]): boolean {
  return (
    hasGrant(grants, "nav:record") &&
    !hasGrant(grants, "nav:banking") &&
    !hasGrant(grants, "nav:reports")
  );
}

export function MobileMoreMenu() {
  const { deliveryEnabled } = useQuickActions();
  const { grants } = useEntityAccess();
  const [query, setQuery] = useState("");
  const navRows = useMemo(() => {
    const settings = { deliveryEnabled };
    return MORE_NAV_ITEMS.flatMap((entry) => {
      const route = routeForHref(entry.href);
      if (!route) return [];
      if (filterNavItemsByEntitySettings([route], settings).length === 0) {
        return [];
      }
      if (!matchesMoreNavSearch(entry.label, query)) return [];
      return [{ href: entry.href, label: entry.label, icon: route.icon }];
    });
  }, [query, deliveryEnabled]);

  const showSettings =
    hasGrant(grants, "nav:settings") &&
    matchesMoreNavSearch("Settings", query);

  if (hasLimitedMoreMenu(grants)) {
    return (
      <div className="pb-2">
        <MobileEntitySwitcher />
        <p className="px-3 py-4 text-sm text-muted-foreground">
          Your access is limited to daily recording. Use Record to post sales and
          expenses, or Sales to review this month&apos;s entries.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-2">
      <MobileEntitySwitcher />

      <div className="mb-4 px-3">
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            className="h-11 pl-9"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-sm">
        {navRows.map((row) => (
          <MoreRow
            key={row.href}
            href={row.href}
            label={row.label}
            icon={row.icon}
          />
        ))}
        {showSettings && (
          <MoreRow
            href="/settings/restaurant"
            label="Settings"
            icon={Settings}
            mutedIcon
          />
        )}
        {navRows.length === 0 && !showSettings && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No matches for &ldquo;{query.trim()}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
