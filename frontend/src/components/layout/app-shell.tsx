"use client";

/** App shell — sidebar + top bar (DESIGN_SYSTEM.md §6). */

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/layout/account-menu";
import { EntityBadge } from "@/components/layout/entity-badge";
import { CommandPalette } from "@/components/command-palette";
import { NewMenu } from "@/components/new-menu";
import { QuickActionsProvider, useQuickActions } from "@/components/quick-actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { useApiAuth } from "@/lib/api-auth";
import {
  navGroups,
  isNavChildActive,
  isNavItemActive,
  sidebarChildrenForNavItem,
  filterNavItemsByEntitySettings,
} from "@/lib/app-routes";
import { useEntity } from "@/lib/entity-context";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  title = "Overview",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <QuickActionsProvider>
      <AppShellInner title={title}>{children}</AppShellInner>
    </QuickActionsProvider>
  );
}

function AppShellInner({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const { clerkEnabled: authOn } = useApiAuth();
  const { deliveryEnabled } = useQuickActions();
  const {
    entityId,
    setEntityId,
    actorId,
    setActorId,
    entities,
    entitiesLoading,
  } = useEntity();

  const navSettings = { deliveryEnabled };
  const activeEntity = entities.find((entity) => entity.id === entityId);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border px-4 py-4">
          <p className="text-lg font-semibold text-primary">Mizan</p>
          <p className="text-xs text-muted-foreground">Restaurant bookkeeping</p>
        </div>
        <NewMenu />
        <div className="border-b border-border px-3 py-3">
          <Label htmlFor="entity-select">Restaurant</Label>
          {authOn ? (
            <div className="mt-1">
              {activeEntity ? (
                <EntityBadge
                  entityId={activeEntity.id}
                  name={activeEntity.name}
                  className="w-full"
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {entitiesLoading ? "Loading…" : "Use the account menu to switch"}
                </p>
              )}
            </div>
          ) : entities.length > 0 ? (
            <Combobox
              id="entity-select"
              className="mt-1"
              value={entityId}
              onValueChange={setEntityId}
              options={[
                { value: "", label: "Select…" },
                ...entities.map((entity) => ({
                  value: entity.id,
                  label: entity.name,
                })),
              ]}
              placeholder="Select…"
            />
          ) : (
            <Input
              id="entity-select"
              className="mt-1 font-mono text-xs"
              placeholder={entitiesLoading ? "Loading…" : "uuid"}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          )}
          {!authOn && (
            <>
              <Label htmlFor="actor-id" className="mt-2">
                Actor ID (dev)
              </Label>
              <Input
                id="actor-id"
                className="mt-1 font-mono text-xs"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
              />
            </>
          )}
        </div>
        <nav className="flex-1 space-y-4 p-3">
          {navGroups.map((group) => {
            const items = filterNavItemsByEntitySettings(group.items, navSettings);
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isNavItemActive(pathname, item);
                    const children = sidebarChildrenForNavItem(
                      item.href,
                      navSettings,
                    );
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
                          <ul className="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
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
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-6">
          <h1 className="text-sm font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="hidden gap-2 sm:inline-flex"
              onClick={() =>
                window.dispatchEvent(new Event("mizan:command-palette"))
              }
            >
              <Search className="size-4" />
              <span className="text-muted-foreground">Search</span>
              <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            {authOn && <AccountMenu />}
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <CommandPalette deliveryEnabled={deliveryEnabled} />
    </div>
  );
}
