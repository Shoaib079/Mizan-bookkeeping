"use client";

/** Daily sales — merged page (M1). One implementation: SalesReviewPanel
 * (date range, All/Needs review/Posted chips, export, edit + void).
 * /review/sales renders the same panel pre-filtered to the review queue. */

import Link from "next/link";
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
    <>
      <div className="mb-4 flex justify-end">
        <Link
          href="/record"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Upload via Record
        </Link>
      </div>
      <Suspense fallback={<TableSkeleton columns={6} />}>
        <SalesReviewPanel showCreate />
      </Suspense>
    </>
  );
}
