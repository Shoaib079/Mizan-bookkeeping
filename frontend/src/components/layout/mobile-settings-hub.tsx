"use client";

import Link from "next/link";
import { ChevronRight, Flag, Landmark, Settings, Users, Cloud } from "lucide-react";

import { MobileSettingsModules } from "@/components/layout/mobile-settings-modules";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-list)] bg-card shadow-[var(--shadow-card)]">{children}</div>
    </section>
  );
}

function SettingsRow({
  href,
  label,
  sublabel,
  icon: Icon,
  meta,
}: {
  href: string;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  meta?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 last:border-b-0 active:bg-muted/60"
    >
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-[var(--settings-icon-fg)]"
        style={{ background: "var(--settings-icon-bg)" }}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug">{label}</span>
        {sublabel ? (
          <span className="block text-xs text-muted-foreground">{sublabel}</span>
        ) : null}
      </span>
      {meta}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

/** iOS-style settings hub — drill-ins replace long scroll on phone (C4). */
export function MobileSettingsHub() {
  return (
    <div className="pb-4">
      <SettingsSection title="Restaurant">
        <SettingsRow
          href="/settings/restaurant?full=1#company-profile"
          label="Company profile"
          sublabel="Name, address, tax details"
          icon={Settings}
        />
        <SettingsRow
          href="/settings/restaurant?full=1#team"
          label="Team"
          sublabel="Members and roles"
          icon={Users}
        />
      </SettingsSection>

      <SettingsSection title="Books">
        <SettingsRow
          href="/onboarding/opening-balances"
          label="Opening balances"
          sublabel="Start-of-period figures"
          icon={Landmark}
        />
      </SettingsSection>

      <MobileSettingsModules />

      <SettingsSection title="Account">
        <SettingsRow
          href="/settings/restaurant?full=1#backups"
          label="Backups"
          sublabel="Download full backup"
          icon={Cloud}
        />
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
