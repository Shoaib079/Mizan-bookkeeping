"use client";

/** App shell — desktop sidebar or mobile bottom tabs (C4, DESIGN_SYSTEM.md §6). */

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { AccountMenu } from "@/components/layout/account-menu";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { MobileTopBar } from "@/components/layout/mobile-top-bar";
import { PageBackLink } from "@/components/layout/page-back-link";
import { TransactionPeekProvider } from "@/components/ledger/transaction-drawer";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { useQuickActions } from "@/components/quick-actions";
import { Logo } from "@/components/ui/logo";
import { NavCountBadge } from "@/components/ui/nav-count-badge";
import { shouldShowNewMenu } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { pushNavHistory } from "@/lib/nav-history";
import { useEntityAccess } from "@/lib/use-entity-access";
import { DESKTOP_CHROME_ONLY, MOBILE_TAB_BAR_PADDING } from "@/lib/mobile-shell";
import { MobileShellTitleProvider } from "@/lib/mobile-shell-title";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { ReviewCountsProvider } from "@/lib/review-counts-context";
import { useReviewCounts } from "@/lib/use-review-counts";
import { cn } from "@/lib/utils";

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

  // The window no longer scrolls, so Next's scroll restoration (which moves
  // `window`) has nothing to move — a new page would open still scrolled down.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const navSettings = { deliveryEnabled };
  const onReviewPage = pathname.startsWith("/review");
  const showRecordFab = shouldShowNewMenu(grants);

  const mobileTitle =
    pathname === "/"
      ? "Dashboard"
      : title;

  // Phone: PageHeader registers its title into MobileTopBar; the in-page H1 is
  // sr-only so it is not painted twice. No muted Group / Section crumb above
  // the title — sidebar / back link / section tabs already show where you are.

  const mainChrome = (
    <>
      <Suspense fallback={null}>
        <NavHistoryTracker />
      </Suspense>
      {!isMobile && <PageBackLink />}
      <ReviewCountsProvider counts={reviewCounts} loading={reviewLoading}>
        <TransactionPeekProvider>{children}</TransactionPeekProvider>
      </ReviewCountsProvider>
    </>
  );

  const mobileGroupedShell =
    pathname === "/more" || pathname === "/settings/restaurant";

  if (isMobile) {
    return (
      <MobileShellTitleProvider>
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
              isMobile && MOBILE_TAB_BAR_PADDING,
              mobileGroupedShell && "bg-muted px-4",
            )}
          >
            {mainChrome}
          </main>
          <MobileBottomTabs showRecord={showRecordFab} />
          <CommandPalette deliveryEnabled={deliveryEnabled} />
        </div>
      </MobileShellTitleProvider>
    );
  }

  return (
    /* The window itself never scrolls — the shell is exactly one viewport tall
     * and only <main> scrolls inside it. `sticky` was not enough: a sticky
     * element still lives in the document's scroll, so rubber-banding past the
     * top or bottom dragged the sidebar with it. With the document fixed there
     * is no page scroll left to drag anything. */
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "flex h-full w-[12.5rem] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-sidebar",
          DESKTOP_CHROME_ONLY,
        )}
      >
        {/* The wordmark is text-brand-ink, not text-primary. It is the
            identity, not a control, so it does not follow the button colour. */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <Logo />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-brand-ink">
              Mizan
            </p>
            <p className="text-xs text-muted-foreground">Restaurant bookkeeping</p>
          </div>
        </div>
        <SidebarNav
          pathname={pathname}
          settings={navSettings}
          reviewTotal={reviewCounts.total}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6",
            DESKTOP_CHROME_ONLY,
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Styled as a field, not a button, even though it is one.
                It opens the command palette, so mechanically it is a button —
                but it reads as a search box, and filling it solid made the
                header look like it held a large blue Search action. Buttons
                carry the primary fill because pressing them does something;
                this one is a promise that you can type here. */}
            <button
              type="button"
              className="hidden h-9 w-64 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex"
              onClick={() =>
                window.dispatchEvent(new Event("mizan:command-palette"))
              }
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </button>
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
        <main
          ref={mainRef}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-6"
          key={entityId}
        >
          {mainChrome}
        </main>
      </div>
      <CommandPalette deliveryEnabled={deliveryEnabled} />
    </div>
  );
}
