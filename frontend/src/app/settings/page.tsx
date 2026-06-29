"use client";

/** Settings hub — Phase 9 Slice 9; v0.71.9 tab layout. */

import {
  Archive,
  Building2,
  Scale,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";

import { useEntity } from "@/lib/entity-context";

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Building2;
  requiresEntity?: boolean;
};

const settingsCards: SettingsCard[] = [
  {
    href: "/settings/entity",
    title: "Restaurant & toggles",
    description:
      "Create a new restaurant, switch entity in the account menu, and manage feature flags.",
    icon: Building2,
  },
  {
    href: "/settings/opening-balances",
    title: "Opening balances",
    description:
      "Go-live wizard — enter day-one balances, preview the journal, and post.",
    icon: Scale,
    requiresEntity: true,
  },
  {
    href: "/settings/members",
    title: "Members & roles",
    description: "Invite users and assign owner, partner, or cashier access.",
    icon: Users,
    requiresEntity: true,
  },
  {
    href: "/settings/expense-items",
    title: "Expense items",
    description:
      "Search item names and merge duplicates into one canonical item (owner only).",
    icon: Tags,
    requiresEntity: true,
  },
  {
    href: "/settings#backups",
    title: "Backups",
    description: "Scheduled backup status and retention (informational).",
    icon: Archive,
  },
];

export default function SettingsPage() {
  const { entityId } = useEntity();

  return (
    <>
      {!entityId && (
        <p className="mb-4 text-sm text-muted-foreground">
          Select a restaurant in the sidebar for entity-specific settings, or
          create one under Restaurant & toggles.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {settingsCards.map((card) => {
          const disabled = card.requiresEntity && !entityId;
          const content = (
            <>
              <card.icon className="mb-3 size-5 text-primary" />
              <h2 className="font-semibold group-hover:text-primary">
                {card.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.description}
              </p>
            </>
          );

          if (disabled) {
            return (
              <div
                key={card.href}
                className="rounded-lg border border-border bg-muted/20 p-4 opacity-60"
              >
                {content}
                <p className="mt-2 text-xs text-muted-foreground">
                  Select a restaurant first.
                </p>
              </div>
            );
          }

          return (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              {content}
            </Link>
          );
        })}
      </div>

      <section id="backups" className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Backup status</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Backups run on a daily schedule via the Celery worker (configured in
          server environment). Artifacts are written to the local backup
          directory or S3 when configured — there is no live status API in this
          release.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>Schedule: daily (hour/minute from server env)</li>
          <li>Retention: daily + weekly archives per env settings</li>
          <li>Restore: operator workflow only — no restore UI in v1</li>
        </ul>
      </section>
    </>
  );
}
