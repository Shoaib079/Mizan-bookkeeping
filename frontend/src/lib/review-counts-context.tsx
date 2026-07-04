"use client";

import { createContext, useContext } from "react";

import {
  EMPTY_REVIEW_COUNTS,
  type ReviewCounts,
} from "@/lib/review-counts-types";

type ReviewCountsContextValue = {
  counts: ReviewCounts;
  loading: boolean;
};

const ReviewCountsContext = createContext<ReviewCountsContextValue>({
  counts: EMPTY_REVIEW_COUNTS,
  loading: true,
});

export function ReviewCountsProvider({
  counts,
  loading,
  children,
}: {
  counts: ReviewCounts;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <ReviewCountsContext.Provider value={{ counts, loading }}>
      {children}
    </ReviewCountsContext.Provider>
  );
}

export function useReviewCountsContext(): ReviewCountsContextValue {
  return useContext(ReviewCountsContext);
}
