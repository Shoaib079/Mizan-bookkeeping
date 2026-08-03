"use client";

/** Keeps non-owner roles on their assigned restaurant — blocks entityId changes. */

import { useEffect, useRef } from "react";

import { canSwitchEntity } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";

export function EntitySwitchGuard() {
  const { entityId, setEntityId } = useEntity();
  const { role, loading } = useEntityAccess();
  const lockedEntityIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (canSwitchEntity(role)) {
      lockedEntityIdRef.current = null;
      return;
    }

    if (!entityId) return;

    if (!lockedEntityIdRef.current) {
      lockedEntityIdRef.current = entityId;
      return;
    }

    if (entityId !== lockedEntityIdRef.current) {
      setEntityId(lockedEntityIdRef.current);
    }
  }, [entityId, loading, role, setEntityId]);

  return null;
}
