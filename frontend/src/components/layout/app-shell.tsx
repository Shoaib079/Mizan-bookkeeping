"use client";

/** App shell — sidebar + top bar (DESIGN_SYSTEM.md §6). */

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/layout/account-menu";
import { EntityBadge } from "@/components/layout/entity-badge";
import { PageBackLink } from "@/components/layout/page-back-link";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { CommandPalette } from "@/components/command-palette";
import { NewMenu } from "@/components/new-menu";
import { useQuickActions } from "@/components/quick-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useEntity } from "@/lib/entity-context";

export function AppShell({
  children,
  title = "Overview",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return <AppShellInner title={title}>{children}</AppShellInner>;
}

function AppShellInner({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const { deliveryEnabled } = useQuickActions();
  const { entityId, entities, entitiesLoading } = useEntity();

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
          <Label htmlFor="sidebar-active-restaurant">Restaurant</Label>
          <div className="mt-1" id="sidebar-active-restaurant">
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
        </div>
        <SidebarNav pathname={pathname} settings={navSettings} />
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
            <AccountMenu />
          </div>
        </header>
        <main className="flex-1 p-6">
          <PageBackLink />
          {children}
        </main>
      </div>
      <CommandPalette deliveryEnabled={deliveryEnabled} />
    </div>
  );
}
