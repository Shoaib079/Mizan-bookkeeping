"use client";

import Link from "next/link";
import {
  ChevronRight,
  Cloud,
  FileText,
  Flag,
  Landmark,
  Settings,
  ToggleLeft,
  Users,
  type LucideIcon,
} from "lucide-react";

import { IconSquare } from "@/components/ui/icon-square";
import {
  SETTINGS_PAGE_TABS,
  hashForSettingsTab,
  type SettingsPageTabId,
} from "@/lib/settings-page-tabs";

const TAB_ICONS: Record<SettingsPageTabId, LucideIcon> = {
  company: Settings,
  menu: FileText,
  teams: Users,
  modules: ToggleLeft,
  opening: Landmark,
  backups: Cloud,
};

const TAB_SUBLABELS: Record<SettingsPageTabId, string> = {
  company: "Display name, legal name, VKN",
  menu: "Logo, address, phones, menu text",
  teams: "Members and roles",
  modules: "Feature toggles for this restaurant",
  opening: "Go-live date, cash, bank, equity",
  backups: "Nightly R2 backups and Backup now",
};

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      {title ? (
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </h2>
      ) : null}
      <div className="overflow-hidden rounded-[var(--radius-list)] border border-border bg-card shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  href,
  label,
  sublabel,
  icon: Icon,
}: {
  href: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 last:border-b-0 active:bg-muted/60"
    >
      <IconSquare icon={Icon} tint="sky" stroke="blue" size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug text-foreground">{label}</span>
        {sublabel ? (
          <span className="block text-xs text-muted-foreground">{sublabel}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

/** iOS-style settings hub — one row per restaurant settings tab (C4). */
export function MobileSettingsHub() {
  return (
    <div className="pb-4">
      <SettingsSection title="Restaurant settings">
        {SETTINGS_PAGE_TABS.map((tab) => (
          <SettingsRow
            key={tab.id}
            href={`/settings/restaurant?full=1${hashForSettingsTab(tab.id)}`}
            label={tab.label}
            sublabel={TAB_SUBLABELS[tab.id]}
            icon={TAB_ICONS[tab.id]}
          />
        ))}
      </SettingsSection>

      <p className="px-3 text-xs text-muted-foreground">
        Sign out is on your profile page (avatar, top-right on tab screens).
      </p>

      <SettingsSection title="">
        <Link
          href="/settings/restaurant?full=1"
          className="flex min-h-[52px] items-center justify-center gap-2 px-4 text-base font-medium text-primary active:bg-muted/60"
        >
          <Flag className="size-4" />
          All settings (full page)
        </Link>
      </SettingsSection>
    </div>
  );
}
