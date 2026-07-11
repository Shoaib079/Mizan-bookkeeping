"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { createEntitySwitchTracker } from "@/lib/use-entity-reset";

type PaginatedResponse<T> = {
  items: T[];
  total: number;
};

export const ENTITY_LIST_PAGE_SIZE = 50;

/** Paginated entity-scoped list (audit A3: no more silent 50-row cap —
 * offset paging is built in; render `TablePager` with the returned controls). */
export function useEntityList<T>(path: string, entityId: string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const entityTrackerRef = useRef(createEntitySwitchTracker());

  useLayoutEffect(() => {
    if (!entityTrackerRef.current.sync(entityId)) return;
    setItems([]);
    setTotal(0);
    setOffset(0);
    setError(null);
    setForbidden(false);
    setLoading(Boolean(entityId));
  }, [entityId]);

  // New filters (path change, e.g. a search) restart from the first page.
  const prevPathRef = useRef(path);
  useLayoutEffect(() => {
    if (prevPathRef.current === path) return;
    prevPathRef.current = path;
    setOffset(0);
  }, [path]);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setForbidden(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const hasLimit = /[?&]limit=/.test(path);
      const sep = path.includes("?") ? "&" : "?";
      const suffix = hasLimit
        ? offset > 0
          ? `&offset=${offset}`
          : ""
        : `${sep}limit=${ENTITY_LIST_PAGE_SIZE}&offset=${offset}`;
      const res = await apiFetch<PaginatedResponse<T>>(
        `/entities/${entityId}${path}${suffix}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, path, offset]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    items,
    total,
    loading,
    error,
    forbidden,
    reload,
    offset,
    setOffset,
    pageSize: ENTITY_LIST_PAGE_SIZE,
  };
}
