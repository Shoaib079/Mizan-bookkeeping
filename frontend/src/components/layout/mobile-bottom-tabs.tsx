"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Menu,
  Plus,
  ScanSearch,
  ShoppingBag,
} from "lucide-react";

import { NavCountBadge } from "@/components/ui/nav-count-badge";
import { activeMobileTab } from "@/lib/mobile-shell";
import { hasGrant, hasMobileMoreTab } from "@/lib/entity-access";
import { useUnsavedWork } from "@/lib/unsaved-work";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

type MobileBottomTabsProps = {
  reviewTotal: number;
  showRecord: boolean;
};

function TabLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      className={cn(
        "relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium transition-colors",
        active ? "text-[var(--tab-active-fg,var(--primary))]" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] px-[var(--tab-active-padding-x)] py-0.5",
          active && "bg-[var(--tab-active-bg)]",
        )}
      >
        <Icon className={cn("size-[18px]", active && "scale-105")} />
        {badge !== undefined && badge > 0 && (
          <NavCountBadge
            count={badge}
            className="absolute -right-2 -top-1 min-w-4 px-1 text-[9px]"
          />
        )}
      </span>
      <span>{label}</span>
      {active && (
        <span
          className="mobile-tab-dot mt-0.5 size-1 rounded-full bg-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

function RecordFab({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate("/record")}
      className="relative flex flex-[1.15] flex-col items-center justify-end pb-1.5 pt-0"
      aria-label="Record"
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background",
          "size-[var(--record-fab-size)] -mt-5 shadow-[var(--record-fab-shadow)]",
          active && "ring-primary/20",
        )}
      >
        <Plus className="size-7 stroke-[2.5]" />
      </span>
      <span
        className={cn(
          "mt-1 text-[10px] font-semibold",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        Record
      </span>
    </button>
  );
}

export function MobileBottomTabs({
  reviewTotal,
  showRecord,
}: MobileBottomTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { requestLeave } = useUnsavedWork();
  const { grants } = useEntityAccess();
  const tab = activeMobileTab(pathname);
  const showReview = hasGrant(grants, "nav:review");
  const showBanking = hasGrant(grants, "nav:banking");
  const showMore = hasMobileMoreTab(grants);
  const showSalesTab = hasGrant(grants, "nav:sales") && !showBanking && !showMore;

  function navigate(href: string) {
    if (href === pathname) return;
    requestLeave(() => router.push(href));
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/90 bg-[var(--tab-bar-bg)] backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="flex items-end">
        <TabLink
          href="/"
          label="Home"
          icon={LayoutDashboard}
          active={tab === "/"}
          onNavigate={navigate}
        />
        {showReview && (
          <TabLink
            href="/review"
            label="Review"
            icon={ScanSearch}
            active={tab === "/review"}
            badge={reviewTotal}
            onNavigate={navigate}
          />
        )}
        {showRecord ? (
          <RecordFab active={tab === "/record"} onNavigate={navigate} />
        ) : (
          <TabLink
            href="/record"
            label="Record"
            icon={Plus}
            active={tab === "/record"}
            onNavigate={navigate}
          />
        )}
        {showBanking && (
          <>
            <TabLink
              href="/banking"
              label="Banking"
              icon={Building2}
              active={tab === "/banking"}
              onNavigate={navigate}
            />
            <TabLink
              href="/more"
              label="More"
              icon={Menu}
              active={tab === "/more"}
              onNavigate={navigate}
            />
          </>
        )}
        {!showBanking && showMore && (
          <TabLink
            href="/more"
            label="More"
            icon={Menu}
            active={tab === "/more"}
            onNavigate={navigate}
          />
        )}
        {showSalesTab && (
          <TabLink
            href="/sales"
            label="Sales"
            icon={ShoppingBag}
            active={pathname.startsWith("/sales")}
            onNavigate={navigate}
          />
        )}
      </div>
    </nav>
  );
}
