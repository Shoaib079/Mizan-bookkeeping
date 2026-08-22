"use client";

import {
  Cloud,
  Flag,
  Landmark,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { IconSquare } from "@/components/ui/icon-square";

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-list)] border border-border bg-card shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

function SettingsRowButton({
  label,
  sublabel,
  icon: Icon,
  onClick,
}: {
  label: string;
  sublabel: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 border-b border-border px-4 text-left last:border-b-0 active:bg-muted/60"
    >
      <IconSquare icon={Icon} tint="sky" stroke="blue" size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{sublabel}</span>
      </span>
    </button>
  );
}

function LocalToggle({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug">{label}</span>
        <span className="block text-xs text-muted-foreground">{sublabel}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-card shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function PreviewMoreScreen({
  onPreviewOnly,
}: {
  onPreviewOnly: (label: string) => void;
}) {
  const [delivery, setDelivery] = useState(true);
  const [groupSales, setGroupSales] = useState(false);

  return (
    <div className="space-y-1" data-preview-screen="more">
      <h1 className="mb-3 px-1 text-lg font-semibold">More</h1>
      <SettingsSection title="Restaurant">
        <SettingsRowButton
          label="Company profile"
          sublabel="Name, address, tax details"
          icon={Settings}
          onClick={() => onPreviewOnly("Company profile")}
        />
        <SettingsRowButton
          label="Team"
          sublabel="Members and roles"
          icon={Users}
          onClick={() => onPreviewOnly("Team")}
        />
      </SettingsSection>

      <SettingsSection title="Books">
        <SettingsRowButton
          label="Opening balances"
          sublabel="Start-of-period figures"
          icon={Landmark}
          onClick={() => onPreviewOnly("Opening balances")}
        />
        <SettingsRowButton
          label="Backups"
          sublabel="Export and restore"
          icon={Cloud}
          onClick={() => onPreviewOnly("Backups")}
        />
      </SettingsSection>

      <SettingsSection title="Modules">
        <LocalToggle
          label="Delivery"
          sublabel="Platform sales"
          checked={delivery}
          onChange={setDelivery}
        />
        <LocalToggle
          label="Group / agency sales"
          sublabel="Menus and bookings"
          checked={groupSales}
          onChange={setGroupSales}
        />
        <div className="flex min-h-[52px] items-center gap-3 px-4">
          <Flag className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Toggles flip locally only — preview does not save settings.
          </span>
        </div>
      </SettingsSection>
    </div>
  );
}
