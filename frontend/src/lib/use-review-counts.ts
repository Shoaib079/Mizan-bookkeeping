"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  EMPTY_REVIEW_COUNTS,
  REVIEW_COUNTS_CHANGED_EVENT,
  type ReviewCounts,
} from "@/lib/review-counts-types";

const POLL_MS = 30_000;

export function useReviewCounts(entityId: string) {
  const [counts, setCounts] = useState<ReviewCounts>(EMPTY_REVIEW_COUNTS);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setCounts(EMPTY_REVIEW_COUNTS);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<ReviewCounts>(
        `/entities/${entityId}/review-counts`,
      );
      setCounts(data);
    } catch {
      setCounts(EMPTY_REVIEW_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!entityId) return;

    const onInvalidate = () => void reload();
    const onFocus = () => void reload();

    window.addEventListener(REVIEW_COUNTS_CHANGED_EVENT, onInvalidate);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void reload(), POLL_MS);

    return () => {
      window.removeEventListener(REVIEW_COUNTS_CHANGED_EVENT, onInvalidate);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [entityId, reload]);

  return { counts, loading, reload };
}
