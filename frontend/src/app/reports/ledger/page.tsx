"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { TableSkeleton } from "@/components/ui/skeleton";

const GeneralLedgerPanel = dynamic(
  () =>
    import("@/components/review/general-ledger-panel").then((mod) => ({
      default: mod.GeneralLedgerPanel,
    })),
  { loading: () => <TableSkeleton columns={6} /> },
);

function GeneralLedgerContent() {
  return (
    <AppShell title="General ledger">
      <GeneralLedgerPanel />
    </AppShell>
  );
}

export default function GeneralLedgerPage() {
  return (
    <Suspense>
      <GeneralLedgerContent />
    </Suspense>
  );
}
