import { Suspense } from "react";

import { CardsPageContent } from "@/components/sales/cards-page-content";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function CardsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CardsPageContent />
    </Suspense>
  );
}
