"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { apiFetch } from "@/lib/api";
import {
  EMPTY_REVIEW_COUNTS,
  REVIEW_COUNTS_CHANGED_EVENT,
  type ReviewCounts,
} from "@/lib/review-counts-types";

const POLL_MS = 30_000;

/** Review-queue badge counts (query-backed in phase 6): 30s poll + window
 * focus revalidation from React Query, plus the app's explicit
 * review-counts-changed event after posting flows. */
export function useReviewCounts(entityId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["review-counts", entityId],
    enabled: Boolean(entityId),
    refetchInterval: POLL_MS,
    queryFn: () => apiFetch<ReviewCounts>(`/entities/${entityId}/review-counts`),
  });

  useEffect(() => {
    if (!entityId) return;
    const onInvalidate = () =>
      void queryClient.invalidateQueries({ queryKey: ["review-counts", entityId] });
    window.addEventListener(REVIEW_COUNTS_CHANGED_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(REVIEW_COUNTS_CHANGED_EVENT, onInvalidate);
  }, [entityId, queryClient]);

  const refetch = query.refetch;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    // Errors fall back to empty counts — the badge simply hides (same as before).
    counts: query.data ?? EMPTY_REVIEW_COUNTS,
    loading: Boolean(entityId) && query.isPending,
    reload,
  };
}
