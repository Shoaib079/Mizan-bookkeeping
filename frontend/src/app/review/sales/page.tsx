"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const SalesReviewPanel = dynamic(
  () =>
    import("@/components/review/sales-review-panel").then((mod) => ({
      default: mod.SalesReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewSalesPage() {
  return <SalesReviewPanel />;
}
