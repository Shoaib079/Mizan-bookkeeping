"use client";

import Link from "next/link";

import { NavCountBadge } from "@/components/ui/nav-count-badge";
import {
  filterNavItemsByEntitySettings,
  isNavItemActive,
  navGroups,
  type AppRoute,
  type EntityNavSettings,
} from "@/lib/app-routes";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  pathname: string;
  settings: EntityNavSettings;
  reviewTotal?: number;
};

function NavRowLink({
  item,
  pathname,
  badgeCount,
}: {
  item: AppRoute;
  pathname: string;
  badgeCount?: number;
}) {
  const active = isNavItemActive(pathname, item);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
        active && "bg-sidebar-accent font-medium text-primary",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <NavCountBadge count={badgeCount} />
      )}
    </Link>
  );
}

export function SidebarNav({
  pathname,
  settings,
  reviewTotal = 0,
}: SidebarNavProps) {
  const overview = navGroups.find((group) => group.label === "Overview");
  const dashboard = overview?.items.find((item) => item.href === "/");
  const hubItems = filterNavItemsByEntitySettings(
    overview?.items.filter((item) => item.href !== "/") ?? [],
    settings,
  );

  return (
    <nav className="flex-1 space-y-1 p-3">
      {dashboard && (
        <div className="mb-2">
          <NavRowLink item={dashboard} pathname={pathname} />
        </div>
      )}

      {hubItems.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {hubItems.map((item) => (
            <NavRowLink
              key={item.href}
              item={item}
              pathname={pathname}
              badgeCount={item.href === "/review" ? reviewTotal : undefined}
            />
          ))}
        </div>
      )}

      {navGroups
        .filter((group) => group.label !== "Overview")
        .map((group) => {
          const items = filterNavItemsByEntitySettings(group.items, settings);
          const item = items[0];
          if (!item) return null;

          return (
            <div
              key={group.label}
              className="border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <NavRowLink item={item} pathname={pathname} />
            </div>
          );
        })}
    </nav>
  );
}
