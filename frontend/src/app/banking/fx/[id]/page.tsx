import { Suspense } from "react";

import { FxWalletPageContent } from "@/components/banking/fx-wallet-page-content";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function FxWalletPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FxWalletPageContent />
    </Suspense>
  );
}
