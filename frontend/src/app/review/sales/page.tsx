"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";

/** Named for what it is — a lazy wrapper — not for what it loads.
 * Sharing the panel's name shadows it, so looking the component up by
 * symbol finds several declarations and cannot tell which is meant. */
const LazySalesReviewPanel = dynamic(
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
      <LazySalesReviewPanel defaultFilter="pending" title="Sales to review" />
    </Suspense>
  );
}
