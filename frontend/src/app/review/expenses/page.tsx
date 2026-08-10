"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";

/** Named for what it is — a lazy wrapper — not for what it loads.
 * Sharing the panel's name shadowed it, so looking the component up by
 * symbol found two declarations and could not tell which was meant. */
const LazyExpensesReviewPanel = dynamic(
  () =>
    import("@/components/review/expenses-review-panel").then((mod) => ({
      default: mod.ExpensesReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewExpensesPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={5} />}>
      <LazyExpensesReviewPanel />
    </Suspense>
  );
}
