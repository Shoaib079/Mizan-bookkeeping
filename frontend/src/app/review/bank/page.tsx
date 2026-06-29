"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const StatementReviewPanel = dynamic(
  () =>
    import("@/components/review/statement-review-panel").then((mod) => ({
      default: mod.StatementReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={4} /> },
);

export default function ReviewBankPage() {
  return <StatementReviewPanel />;
}
