"use client";

import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";

import { MobileEntitySwitcher } from "@/components/layout/mobile-entity-switcher";
import { appRoutes, filterNavItemsByEntitySettings, type AppRoute } from "@/lib/app-routes";
import { hasGrant } from "@/lib/entity-access";
import { useQuickActions } from "@/components/quick-actions";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

const MORE_SECTION_HREFS: { label: string; hrefs: string[] }[] = [
  {
    label: "Money in",
    hrefs: ["/sales", "/delivery", "/customers"],
  },
  {
    label: "Money out",
    hrefs: ["/suppliers", "/staff", "/partners"],
  },
  {
    label: "Money held",
    hrefs: ["/cards", "/banking/cash"],
  },
  {
    label: "Understand",
    hrefs: ["/reports"],
  },
];

function routeForHref(href: string): AppRoute | undefined {
  return appRoutes.find((r) => r.href === href);
}

function MoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl bg-card shadow-sm">{children}</div>
    </section>
  );
}

function MoreRow({ item }: { item: AppRoute }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex min-h-[52px] items-center gap-3 border-b border-[#f2f2f7] px-4 last:border-b-0 active:bg-muted/60"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-base">{item.label}</span>
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
  const settings = { deliveryEnabled };

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

      {MORE_SECTION_HREFS.map(({ label, hrefs }) => {
        const items = hrefs
          .map((href) => routeForHref(href))
          .filter((item): item is AppRoute => item !== undefined)
          .filter((item) =>
            filterNavItemsByEntitySettings([item], settings).length > 0,
          );
        if (items.length === 0) return null;

        return (
          <MoreSection key={label} title={label}>
            {items.map((item) => (
              <MoreRow key={item.href} item={item} />
            ))}
          </MoreSection>
        );
      })}

      {hasGrant(grants, "nav:settings") && (
        <MoreSection title="Setup">
          <Link
            href="/settings/restaurant"
            className="flex min-h-[52px] items-center gap-3 px-4 active:bg-muted/60"
          >
            <span
              className={cn(
                "flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-muted",
              )}
            >
              <Settings className="size-4 text-muted-foreground" />
            </span>
            <span className="flex-1 text-base">Settings</span>
            <ChevronRight className="size-4 text-muted-foreground/60" />
          </Link>
        </MoreSection>
      )}
    </div>
  );
}
