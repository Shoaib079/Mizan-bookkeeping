"use client";

import { Suspense } from "react";

import { DeliveryReportsPanel } from "@/components/delivery/delivery-reports-panel";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function DeliveryReportsPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={4} />}>
      <DeliveryReportsPanel />
    </Suspense>
  );
}
