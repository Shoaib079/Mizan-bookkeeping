"use client";

/** Daily sales — merged page (M1). One implementation: SalesReviewPanel
 * (date range, All/Needs review/Posted chips, export, edit + void).
 * /review/sales renders the same panel pre-filtered to the review queue. */

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

export default function SalesPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={6} />}>
      <SalesReviewPanel showCreate />
    </Suspense>
  );
}
