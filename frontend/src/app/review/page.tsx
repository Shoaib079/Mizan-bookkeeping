"use client";

/** Smart redirect — land on the first Review tab with pending items. */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { PageSkeleton } from "@/components/ui/skeleton";
import { useEntity } from "@/lib/entity-context";
import { useReviewCountsContext } from "@/lib/review-counts-context";
import { firstNonZeroReviewHref } from "@/lib/review-tab-counts";

export default function ReviewIndexPage() {
  const router = useRouter();
  const { entityId } = useEntity();
  const { counts, loading } = useReviewCountsContext();
  const prevEntityId = useRef(entityId);

  useEffect(() => {
    if (loading || !entityId) return;

    if (prevEntityId.current !== entityId) {
      prevEntityId.current = entityId;
      return;
    }

    prevEntityId.current = entityId;
    router.replace(firstNonZeroReviewHref(counts.by_tab));
  }, [loading, entityId, counts.by_tab, router]);

  return <PageSkeleton />;
}
