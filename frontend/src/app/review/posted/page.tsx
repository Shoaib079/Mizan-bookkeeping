"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const GeneralLedgerPanel = dynamic(
  () =>
    import("@/components/review/general-ledger-panel").then((mod) => ({
      default: mod.GeneralLedgerPanel,
    })),
  { loading: () => <TableSkeleton columns={6} /> },
);

export default function ReviewPostedPage() {
  return <GeneralLedgerPanel />;
}
