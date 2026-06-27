"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  filterNavItemsByEntitySettings,
  isNavChildActive,
  isNavItemActive,
  navGroups,
  sidebarChildrenForNavItem,
  type EntityNavSettings,
} from "@/lib/app-routes";
import {
  navGroupContainsPathname,
  resolveSidebarGroupState,
  toggleSidebarGroupState,
  writeSidebarGroupState,
} from "@/lib/sidebar-nav-state";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  pathname: string;
  settings: EntityNavSettings;
};

export function SidebarNav({ pathname, settings }: SidebarNavProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    resolveSidebarGroupState(pathname, settings),
  );

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const group of navGroups) {
        if (group.label === "Overview") continue;
        if (navGroupContainsPathname(group.label, pathname, settings)) {
          if (!next[group.label]) {
            next[group.label] = true;
            changed = true;
          }
        }
      }
      if (changed) {
        writeSidebarGroupState(next);
      }
      return changed ? next : prev;
    });
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
          <Link
            href={dashboard.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
              isNavItemActive(pathname, dashboard) &&
                "bg-sidebar-accent font-medium text-primary",
            )}
          >
            <dashboard.icon className="size-4" />
            {dashboard.label}
          </Link>
        </div>
      )}

      {navGroups
        .filter((group) => group.label !== "Overview")
        .map((group) => {
          const items = filterNavItemsByEntitySettings(group.items, settings);
          if (items.length === 0) return null;
          const open = openGroups[group.label] ?? false;
          const panelId = `sidebar-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`;

          return (
            <div key={group.label} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.label)}
              >
                <span>{group.label}</span>
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
                  {items.map((item) => {
                    const active = isNavItemActive(pathname, item);
                    const children = sidebarChildrenForNavItem(item.href, settings);
                    return (
                      <li key={item.href}>
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
                        {children.length > 0 && (
                          <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                            {children.map((child) => {
                              const childActive = isNavChildActive(pathname, child);
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={cn(
                                      "block rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent",
                                      childActive &&
                                        "bg-sidebar-accent font-medium text-primary",
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
    </nav>
  );
}
