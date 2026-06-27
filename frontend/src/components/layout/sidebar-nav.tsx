"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  filterNavItemsByEntitySettings,
  isNavItemActive,
  navGroups,
  type AppRoute,
  type EntityNavSettings,
} from "@/lib/app-routes";
import {
  resolveSidebarGroupState,
  sidebarGroupStateForPathname,
  toggleSidebarGroupState,
  writeSidebarGroupState,
} from "@/lib/sidebar-nav-state";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  pathname: string;
  settings: EntityNavSettings;
};

function NavRowLink({ item, pathname }: { item: AppRoute; pathname: string }) {
  const active = isNavItemActive(pathname, item);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
        active && "bg-sidebar-accent font-medium text-primary",
      )}
    >
      <item.icon className="size-4" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({ pathname, settings }: SidebarNavProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    resolveSidebarGroupState(pathname, settings),
  );

  useEffect(() => {
    const next = sidebarGroupStateForPathname(pathname, settings);
    setOpenGroups(next);
    writeSidebarGroupState(next);
  }, [pathname, settings]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = toggleSidebarGroupState(prev, label);
      writeSidebarGroupState(next);
      return next;
    });
  }

  const overview = navGroups.find((group) => group.label === "Overview");
  const dashboard = overview?.items.find((item) => item.href === "/");

  return (
    <nav className="flex-1 space-y-1 p-3">
      {dashboard && (
        <div className="mb-2">
          <NavRowLink item={dashboard} pathname={pathname} />
        </div>
      )}

      {navGroups
        .filter((group) => group.label !== "Overview")
        .map((group) => {
          const items = filterNavItemsByEntitySettings(group.items, settings);
          if (items.length === 0) return null;

          if (items.length === 1) {
            return (
              <div
                key={group.label}
                className="border-t border-border pt-2 first:border-t-0 first:pt-0"
              >
                <NavRowLink item={items[0]!} pathname={pathname} />
              </div>
            );
          }

          const open = openGroups[group.label] ?? false;
          const panelId = `sidebar-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`;

          return (
            <div
              key={group.label}
              className="border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.label)}
              >
                <span className="inline-flex items-center gap-2">
                  <group.icon className="size-4 shrink-0" aria-hidden />
                  {group.label}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {open && (
                <ul id={panelId} className="mt-0.5 space-y-0.5">
                  {items.map((item) => (
                    <li key={item.href}>
                      <NavRowLink item={item} pathname={pathname} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </nav>
  );
}
