"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  items: T[];
  total: number;
};

export const ENTITY_LIST_PAGE_SIZE = 50;

/** Paginated entity-scoped list (audit A3 + C2b).
 *
 * Phase 6: backed by React Query — results cached per
 * [entityId, path, offset], revalidated in the background (window focus),
 * and invalidated globally on "mizan:ledger-changed". Return contract is
 * unchanged from the hand-rolled version, so consumers need no edits:
 * fresh keys show the skeleton exactly like before; revisits are instant.
 */
export function useEntityList<T>(path: string, entityId: string) {
  const [offset, setOffset] = useState(0);

  // New filters (path change, e.g. a search) restart from the first page.
  const prevPathRef = useRef(path);
  useLayoutEffect(() => {
    if (prevPathRef.current === path) return;
    prevPathRef.current = path;
    setOffset(0);
  }, [path]);

  // Entity switch also restarts paging.
  const prevEntityRef = useRef(entityId);
  useLayoutEffect(() => {
    if (prevEntityRef.current === entityId) return;
    prevEntityRef.current = entityId;
    setOffset(0);
  }, [entityId]);

  const query = useQuery<PaginatedResponse<T>, Error>({
    queryKey: ["entity-list", entityId, path, offset],
    enabled: Boolean(entityId),
    queryFn: async () => {
      const hasLimit = /[?&]limit=/.test(path);
      const sep = path.includes("?") ? "&" : "?";
      const suffix = hasLimit
        ? offset > 0
          ? `&offset=${offset}`
          : ""
        : `${sep}limit=${ENTITY_LIST_PAGE_SIZE}&offset=${offset}`;
      return apiFetch<PaginatedResponse<T>>(`/entities/${entityId}${path}${suffix}`);
    },
  });

  const refetch = query.refetch;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const errorMessage =
    query.error && !forbidden ? query.error.message || "Failed to load" : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: Boolean(entityId) && query.isPending,
    error: errorMessage,
    forbidden,
    reload,
    offset,
    setOffset,
    pageSize: ENTITY_LIST_PAGE_SIZE,
  };
}
