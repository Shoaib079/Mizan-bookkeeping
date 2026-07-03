"use client";

/** App shell — sidebar + top bar (DESIGN_SYSTEM.md §6). */

import Link from "next/link";
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
import { NavCountBadge } from "@/components/ui/nav-count-badge";
import { Label } from "@/components/ui/input";
import { useEntity } from "@/lib/entity-context";
import { ReviewCountsProvider } from "@/lib/review-counts-context";
import { useReviewCounts } from "@/lib/use-review-counts";

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
  const { counts: reviewCounts } = useReviewCounts(entityId);

  const navSettings = { deliveryEnabled };
  const activeEntity = entities.find((entity) => entity.id === entityId);
  const onReviewPage = pathname.startsWith("/review");

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
        <SidebarNav
          pathname={pathname}
          settings={navSettings}
          reviewTotal={reviewCounts.total}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {reviewCounts.total > 0 && !onReviewPage && (
              <Link
                href="/review"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-warning/15 dark:text-amber-200"
              >
                Review
                <NavCountBadge count={reviewCounts.total} className="bg-warning/25" />
              </Link>
            )}
          </div>
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
        <main className="flex-1 p-6" key={entityId}>
          <PageBackLink />
          <ReviewCountsProvider counts={reviewCounts}>
            {children}
          </ReviewCountsProvider>
        </main>
      </div>
      <CommandPalette deliveryEnabled={deliveryEnabled} />
    </div>
  );
}
