"use client";

import { ArrowLeftRight, Building2, Wallet } from "lucide-react";
import Link from "next/link";

import { useEntity } from "@/lib/entity-context";

const LINKS = [
  {
    href: "/banking",
    title: "Accounts",
    description: "Bank, cash drawer, and FX wallet balances.",
    icon: Building2,
  },
  {
    href: "/banking/transfers",
    title: "Transfers",
    description: "Move money between accounts.",
    icon: ArrowLeftRight,
  },
  {
    href: "/banking/cash",
    title: "Cash drawer",
    description: "Drawer movements and close-day history.",
    icon: Wallet,
  },
] as const;

export function CashBankEntry() {
  const { entityId } = useEntity();

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        {entityId
          ? "Open the banking tree for account balances and operations."
          : "Select a restaurant in the sidebar."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <link.icon className="mb-3 size-5 text-primary" />
            <h2 className="font-semibold group-hover:text-primary">
              {link.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
