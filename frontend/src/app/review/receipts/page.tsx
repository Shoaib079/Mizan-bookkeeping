"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const LazyReceiptsReviewPanel = dynamic(
  () =>
    import("@/components/review/receipts-review-panel").then((mod) => ({
      default: mod.ReceiptsReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={4} /> },
);

export default function ReviewReceiptsPage() {
  return <LazyReceiptsReviewPanel />;
}
