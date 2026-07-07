import { Suspense } from "react";

import { FxHubPageContent } from "@/components/banking/fx-hub-page-content";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function BankingFxHubPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FxHubPageContent />
    </Suspense>
  );
}
