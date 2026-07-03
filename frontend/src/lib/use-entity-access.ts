"use client";

/** Load caller role per entity for UI gating (Slice 11.21). */

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  canReadFinancialReports,
  canWriteOperations,
} from "@/lib/entity-access";
import type { EntityRole } from "@/lib/settings-types";
import { useEntity } from "@/lib/entity-context";

type MyMembershipRead = {
  role: EntityRole;
  permissions: string[];
};

/** Least-privilege fallback until the real membership is loaded. */
export const DEFAULT_DEV_ROLE: EntityRole = "partner_view_only";

export function useEntityAccess() {
  const { entityId } = useEntity();
  const [role, setRole] = useState<EntityRole>(DEFAULT_DEV_ROLE);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setRole(DEFAULT_DEV_ROLE);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<MyMembershipRead>(
        `/entities/${entityId}/members/me`,
      );
      setRole(res.role);
    } catch {
      setRole(DEFAULT_DEV_ROLE);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    role,
    loading,
    canWriteOperations: canWriteOperations(role),
    canReadFinancialReports: canReadFinancialReports(role),
    reload,
  };
}
