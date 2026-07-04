"use client";

/**
 * Shared entity-access context — ONE fetch per entity, every consumer reads the
 * same role. Replaces the old per-component useState + fetch that caused the
 * QuickActionsProvider vs hub role desync (SEC-4 least-privilege fallback).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  canReadFinancialReports,
  canWriteOperations,
} from "@/lib/entity-access";
import type { EntityRole } from "@/lib/settings-types";
import { useEntity } from "@/lib/entity-context";
import { useApiAuth } from "@/lib/api-auth";

type MyMembershipRead = {
  role: EntityRole;
  permissions: string[];
};

/** Least-privilege fallback until the real membership is loaded. */
export const DEFAULT_DEV_ROLE: EntityRole = "partner_view_only";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;

type EntityAccessContextValue = {
  role: EntityRole;
  loading: boolean;
  canWriteOperations: boolean;
  canReadFinancialReports: boolean;
  reload: () => Promise<void>;
};

const EntityAccessContext = createContext<EntityAccessContextValue | null>(null);

export function EntityAccessProvider({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  const { isAuthReady } = useApiAuth();
  const [role, setRole] = useState<EntityRole>(DEFAULT_DEV_ROLE);
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!entityId || !isAuthReady) {
      setRole(DEFAULT_DEV_ROLE);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await apiFetch<MyMembershipRead>(
          `/entities/${entityId}/members/me`,
        );
        if (fetchIdRef.current !== id) return;
        setRole(res.role);
        setLoading(false);
        return;
      } catch (err) {
        if (fetchIdRef.current !== id) return;

        const is403 =
          err instanceof Error &&
          (err.message.includes("403") || err.message.includes("Forbidden"));
        if (is403) {
          setRole(DEFAULT_DEV_ROLE);
          setLoading(false);
          return;
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          if (fetchIdRef.current !== id) return;
          continue;
        }

        setRole(DEFAULT_DEV_ROLE);
        setLoading(false);
      }
    }
  }, [entityId, isAuthReady]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      role,
      loading,
      canWriteOperations: canWriteOperations(role),
      canReadFinancialReports: canReadFinancialReports(role),
      reload,
    }),
    [role, loading, reload],
  );

  return (
    <EntityAccessContext.Provider value={value}>
      {children}
    </EntityAccessContext.Provider>
  );
}

export function useEntityAccess() {
  const ctx = useContext(EntityAccessContext);
  if (!ctx) {
    throw new Error("useEntityAccess must be used within EntityAccessProvider");
  }
  return ctx;
}
