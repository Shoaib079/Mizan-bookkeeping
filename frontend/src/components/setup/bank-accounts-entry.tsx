"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";

import { useEntity } from "@/lib/entity-context";

export function BankAccountsEntry() {
  const { entityId } = useEntity();

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        {entityId
          ? "Manage bank, cash drawer, FX wallets, and card clearing accounts in Banking."
          : "Select a restaurant in the sidebar."}
      </p>
      <Link
        href="/banking"
        className="group inline-flex max-w-md flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
      >
        <Building2 className="mb-3 size-5 text-primary" />
        <h2 className="font-semibold group-hover:text-primary">
          Open Banking
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Account tree, statement upload, transfers, and cash drawer.
        </p>
      </Link>
    </>
  );
}
