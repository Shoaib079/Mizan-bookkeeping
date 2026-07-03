"use client";

import { createContext, useContext } from "react";

import {
  EMPTY_REVIEW_COUNTS,
  type ReviewCounts,
} from "@/lib/review-counts-types";

type ReviewCountsContextValue = {
  counts: ReviewCounts;
};

const ReviewCountsContext = createContext<ReviewCountsContextValue>({
  counts: EMPTY_REVIEW_COUNTS,
});

export function ReviewCountsProvider({
  counts,
  children,
}: {
  counts: ReviewCounts;
  children: React.ReactNode;
}) {
  return (
    <ReviewCountsContext.Provider value={{ counts }}>
      {children}
    </ReviewCountsContext.Provider>
  );
}

export function useReviewCountsContext(): ReviewCountsContextValue {
  return useContext(ReviewCountsContext);
}
