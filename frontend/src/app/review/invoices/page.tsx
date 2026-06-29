"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/ui/skeleton";

const InvoicesReviewPanel = dynamic(
  () =>
    import("@/components/review/invoices-review-panel").then((mod) => ({
      default: mod.InvoicesReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewInvoicesPage() {
  return <InvoicesReviewPanel />;
}
