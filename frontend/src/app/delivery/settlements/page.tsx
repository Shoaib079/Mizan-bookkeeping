"use client";

import { Suspense } from "react";

import { DeliverySettlementsPanel } from "@/components/delivery/delivery-settlements-panel";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function DeliverySettlementsPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={4} />}>
      <DeliverySettlementsPanel />
    </Suspense>
  );
}
