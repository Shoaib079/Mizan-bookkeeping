"use client";

/** Mobile More hub — flat nav + app-wide palette search (no list filter). */

import { useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ScanSearch,
  Search,
  Settings,
  Split,
} from "lucide-react";

import { MobileEntitySwitcher } from "@/components/layout/mobile-entity-switcher";
import { NavCountBadge } from "@/components/ui/nav-count-badge";
import {
  appRoutes,
  filterNavItemsByEntitySettings,
  type AppRoute,
} from "@/lib/app-routes";
import { hasGrant } from "@/lib/entity-access";
import { useQuickActions } from "@/components/quick-actions";
import { useReviewCountsContext } from "@/lib/review-counts-context";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

/** Flat More destinations (Sales lives on the bottom tab bar). */
export const MORE_NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/review", label: "Review" },
  { href: "/delivery", label: "Delivery" },
  { href: "/customers", label: "Customers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/staff", label: "Staff" },
  { href: "/partners", label: "Partners" },
  { href: "/split", label: "Split" },
  { href: "/cards", label: "Cards" },
  { href: "/reports", label: "Reports" },
];

function routeForHref(href: string): AppRoute | undefined {
  return appRoutes.find((r) => r.href === href);
}

function openAppSearch() {
  window.dispatchEvent(new Event("mizan:command-palette"));
}

function MoreRow({
  href,
  label,
  icon: Icon,
  mutedIcon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  mutedIcon?: boolean;
  badge?: number;
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
          className={cn("size-4", mutedIcon && "text-muted-foreground")}
        />
      </span>
      <span className="min-w-0 flex-1 text-base">{label}</span>
      {badge !== undefined && badge > 0 && <NavCountBadge count={badge} />}
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
  const { counts } = useReviewCountsContext();

  const navRows = useMemo(() => {
    const settings = { deliveryEnabled };
    return MORE_NAV_ITEMS.flatMap((entry) => {
      if (entry.href === "/split") {
        if (!hasGrant(grants, "nav:record")) return [];
        return [
          {
            href: entry.href,
            label: entry.label,
            icon: Split,
            badge: undefined as number | undefined,
          },
        ];
      }
      if (entry.href === "/review") {
        if (!hasGrant(grants, "nav:review")) return [];
        const route = routeForHref("/review");
        return [
          {
            href: entry.href,
            label: entry.label,
            icon: route?.icon ?? ScanSearch,
            badge: counts.total,
          },
        ];
      }
      const route = routeForHref(entry.href);
      if (!route) return [];
      if (filterNavItemsByEntitySettings([route], settings).length === 0) {
        return [];
      }
      return [
        {
          href: entry.href,
          label: entry.label,
          icon: route.icon,
          badge: undefined as number | undefined,
        },
      ];
    });
  }, [deliveryEnabled, grants, counts.total]);

  const showSettings = hasGrant(grants, "nav:settings");

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
        <button
          type="button"
          onClick={openAppSearch}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm text-muted-foreground shadow-sm active:bg-muted/60"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">Search the app…</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-sm">
        {navRows.map((row) => (
          <MoreRow
            key={row.href}
            href={row.href}
            label={row.label}
            icon={row.icon}
            badge={row.badge}
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
      </div>
    </div>
  );
}
