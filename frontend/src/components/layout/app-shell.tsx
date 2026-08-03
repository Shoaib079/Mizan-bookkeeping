"use client";

/** App shell — desktop sidebar or mobile bottom tabs (C4, DESIGN_SYSTEM.md §6). */

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { AccountMenu } from "@/components/layout/account-menu";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { MobileTopBar } from "@/components/layout/mobile-top-bar";
import { PageBackLink } from "@/components/layout/page-back-link";
import { TransactionPeekProvider } from "@/components/ledger/transaction-drawer";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { useQuickActions } from "@/components/quick-actions";
import { Button } from "@/components/ui/button";
import { NavCountBadge } from "@/components/ui/nav-count-badge";
import { navGroups, isNavItemActive } from "@/lib/app-routes";
import { isMobileTabRoot } from "@/lib/mobile-shell";
import { shouldShowNewMenu } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { pushNavHistory } from "@/lib/nav-history";
import { useEntityAccess } from "@/lib/use-entity-access";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { ReviewCountsProvider } from "@/lib/review-counts-context";
import { useReviewCounts } from "@/lib/use-review-counts";
import { cn } from "@/lib/utils";

/** "Group / Section" crumb above the page title (audit A4/C3). */
function breadcrumbForPathname(pathname: string, title: string): string | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === "/" || !isNavItemActive(pathname, item)) continue;
      const parts =
        group.label === "Overview" ? [item.label] : [group.label, item.label];
      if (parts[parts.length - 1] === title) parts.pop();
      return parts.length > 0 ? parts.join(" / ") : null;
    }
  }
  return null;
}

function NavHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const search = searchParams.toString();
    pushNavHistory(search ? `${pathname}?${search}` : pathname);
  }, [pathname, searchParams]);
  return null;
}

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
  const isMobile = useIsMobileShell();
  const { deliveryEnabled } = useQuickActions();
  const { entityId } = useEntity();
  const { grants } = useEntityAccess();
  const { counts: reviewCounts, loading: reviewLoading } = useReviewCounts(entityId);

  const navSettings = { deliveryEnabled };
  const onReviewPage = pathname.startsWith("/review");
  const breadcrumb = breadcrumbForPathname(pathname, title);
  const onMobileTabRoot = isMobile && isMobileTabRoot(pathname);
  const showMobileTabs = isMobile;
  const showRecordFab = shouldShowNewMenu(grants);

  const mobileTitle =
    pathname === "/"
      ? "Dashboard"
      : title;

  const mainChrome = (
    <>
      <Suspense fallback={null}>
        <NavHistoryTracker />
      </Suspense>
      {!isMobile && <PageBackLink />}
      {!isMobile && (
        <div className="mb-5">
          {breadcrumb && (
            <p className="text-xs text-muted-foreground">{breadcrumb}</p>
          )}
          <h1 className="mt-0.5 truncate text-xl font-semibold">{title}</h1>
        </div>
      )}
      <ReviewCountsProvider counts={reviewCounts} loading={reviewLoading}>
        <TransactionPeekProvider>{children}</TransactionPeekProvider>
      </ReviewCountsProvider>
    </>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <MobileTopBar
          title={mobileTitle}
          reviewTotal={reviewCounts.total}
          onReviewPage={onReviewPage}
        />
        <main
          key={entityId}
          className={cn(
            "flex-1 overflow-y-auto overscroll-y-contain px-3.5 py-3",
            isMobile &&
              "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]",
            pathname === "/more" && "bg-[#f2f2f7] px-4",
          )}
        >
          {mainChrome}
        </main>
        {showMobileTabs && (
          <MobileBottomTabs
            reviewTotal={reviewCounts.total}
            showRecord={showRecordFab}
          />
        )}
        <CommandPalette deliveryEnabled={deliveryEnabled} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border px-4 py-4">
          <p className="text-lg font-semibold text-primary">Mizan</p>
          <p className="text-xs text-muted-foreground">Restaurant bookkeeping</p>
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
            <Button
              type="button"
              variant="secondary"
              className="hidden gap-2 sm:inline-flex"
              onClick={() =>
                window.dispatchEvent(new Event("mizan:command-palette"))
              }
            >
              <Search className="size-4" />
              <span className="text-muted-foreground">Search…</span>
              <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
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
            {showRecordFab && (
              <Link
                href="/record"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-4" />
                Record
              </Link>
            )}
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <main className="flex-1 p-6" key={entityId}>
          {mainChrome}
        </main>
      </div>
      <CommandPalette deliveryEnabled={deliveryEnabled} />
    </div>
  );
}
