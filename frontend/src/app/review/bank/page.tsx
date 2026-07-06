"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";

const StatementReviewPanel = dynamic(
  () =>
    import("@/components/review/statement-review-panel").then((mod) => ({
      default: mod.StatementReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={4} /> },
);

export default function ReviewBankPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={4} />}>
      <StatementReviewPanel />
    </Suspense>
  );
}
