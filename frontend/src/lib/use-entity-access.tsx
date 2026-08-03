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
import {
  isSessionRevokedError,
  notifyRoleChanged,
  notifySessionRevoked,
} from "@/lib/session-access";
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

export type ReloadAccessOptions = {
  /** Skip loading spinner — used for background membership sync polls. */
  silent?: boolean;
};

type EntityAccessContextValue = {
  role: EntityRole;
  loading: boolean;
  /** True after a successful /members/me response for the current entity. */
  membershipSettled: boolean;
  canWriteOperations: boolean;
  canReadFinancialReports: boolean;
  reload: (options?: ReloadAccessOptions) => Promise<void>;
};

const EntityAccessContext = createContext<EntityAccessContextValue | null>(null);

export function EntityAccessProvider({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  const { isAuthReady } = useApiAuth();
  const [role, setRole] = useState<EntityRole>(DEFAULT_DEV_ROLE);
  const [loading, setLoading] = useState(false);
  const [membershipSettled, setMembershipSettled] = useState(false);
  const fetchIdRef = useRef(0);
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
    setMembershipSettled(false);
  }, [entityId]);

  const reload = useCallback(
    async (options?: ReloadAccessOptions) => {
      if (!entityId || !isAuthReady) {
        setRole(DEFAULT_DEV_ROLE);
        settledRef.current = false;
        setMembershipSettled(false);
        return;
      }

      const id = ++fetchIdRef.current;
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await apiFetch<MyMembershipRead>(
            `/entities/${entityId}/members/me`,
          );
          if (fetchIdRef.current !== id) return;

          setRole((previous) => {
            if (settledRef.current && previous !== res.role) {
              notifyRoleChanged(previous, res.role);
            }
            return res.role;
          });
          settledRef.current = true;
          setMembershipSettled(true);
          if (!silent) setLoading(false);
          return;
        } catch (err) {
          if (fetchIdRef.current !== id) return;

          const revokeReason = isSessionRevokedError(err);
          if (revokeReason) {
            notifySessionRevoked(revokeReason);
            settledRef.current = false;
            setMembershipSettled(false);
            if (!silent) setLoading(false);
            return;
          }

          const is403 =
            err instanceof Error &&
            (err.message.includes("403") || err.message.includes("Forbidden"));
          if (is403) {
            setRole(DEFAULT_DEV_ROLE);
            settledRef.current = false;
            setMembershipSettled(false);
            if (!silent) setLoading(false);
            return;
          }

          if (attempt < MAX_RETRIES) {
            await new Promise((r) =>
              setTimeout(r, RETRY_DELAY_MS * (attempt + 1)),
            );
            if (fetchIdRef.current !== id) return;
            continue;
          }

          setRole(DEFAULT_DEV_ROLE);
          settledRef.current = false;
          setMembershipSettled(false);
          if (!silent) setLoading(false);
        }
      }
    },
    [entityId, isAuthReady],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      role,
      loading,
      membershipSettled,
      canWriteOperations: canWriteOperations(role),
      canReadFinancialReports: canReadFinancialReports(role),
      reload,
    }),
    [role, loading, membershipSettled, reload],
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
