"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

/** Named for what it is — a lazy wrapper — not for what it loads. The fourth
 * of these; sharing the panel's name shadows it, so a symbol lookup finds
 * two declarations and cannot tell which is meant. */
const LazyDeliveryReviewPanel = dynamic(
  () =>
    import("@/components/review/delivery-review-panel").then((mod) => ({
      default: mod.DeliveryReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewDeliveryPage() {
  return <LazyDeliveryReviewPanel />;
}
