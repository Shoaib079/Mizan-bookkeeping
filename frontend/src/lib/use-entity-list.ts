"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  items: T[];
  total: number;
};

export function useEntityList<T>(path: string, entityId: string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setForbidden(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const res = await apiFetch<PaginatedResponse<T>>(
        `/entities/${entityId}${path}${separator}limit=50`,
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
  }, [entityId, path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, total, loading, error, forbidden, reload };
}
