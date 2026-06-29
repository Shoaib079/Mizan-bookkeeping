"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const DeliveryReviewPanel = dynamic(
  () =>
    import("@/components/review/delivery-review-panel").then((mod) => ({
      default: mod.DeliveryReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewDeliveryPage() {
  return <DeliveryReviewPanel />;
}
