"use client";

/** Daily sales — merged page (M1). One implementation: SalesReviewPanel
 * (date range, All/Needs review/Posted chips, export, edit + void).
 * /review/sales renders the same panel pre-filtered to the review queue. */

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

export default function SalesPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={6} />}>
      <LazySalesReviewPanel showCreate />
    </Suspense>
  );
}
