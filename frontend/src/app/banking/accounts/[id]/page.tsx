import { Suspense } from "react";

import { AccountDetailPageContent } from "@/components/banking/account-detail-page-content";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AccountDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountDetailPageContent />
    </Suspense>
  );
}
