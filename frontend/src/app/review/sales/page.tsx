"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";

const SalesReviewPanel = dynamic(
  () =>
    import("@/components/review/sales-review-panel").then((mod) => ({
      default: mod.SalesReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={6} /> },
);

export default function ReviewSalesPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={6} />}>
      {/* M1: same merged panel as /sales, pre-filtered to the review queue. */}
      <SalesReviewPanel defaultFilter="pending" />
    </Suspense>
  );
}
