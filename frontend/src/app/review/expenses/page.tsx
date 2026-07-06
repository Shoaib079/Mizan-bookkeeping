"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";

const ExpensesReviewPanel = dynamic(
  () =>
    import("@/components/review/expenses-review-panel").then((mod) => ({
      default: mod.ExpensesReviewPanel,
    })),
  { loading: () => <TableSkeleton columns={5} /> },
);

export default function ReviewExpensesPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={5} />}>
      <ExpensesReviewPanel />
    </Suspense>
  );
}
