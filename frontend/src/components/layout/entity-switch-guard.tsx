"use client";

/** Applies global entity-switch policy from role — desktop, mobile, all routes. */

import { useEffect, useRef } from "react";

import { canSwitchEntity } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import {
  setEntitySwitchPolicy,
  resetEntitySwitchPolicy,
} from "@/lib/entity-switch-policy";
import { useEntityAccess } from "@/lib/use-entity-access";

export function EntitySwitchGuard() {
  const { entityId, setEntityId } = useEntity();
  const { role, loading } = useEntityAccess();
  const lockedEntityIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (canSwitchEntity(role)) {
      lockedEntityIdRef.current = null;
      resetEntitySwitchPolicy();
      return;
    }

    if (!entityId) {
      setEntitySwitchPolicy({ canSwitch: false, lockedEntityId: null });
      return;
    }

    if (!lockedEntityIdRef.current) {
      lockedEntityIdRef.current = entityId;
    }

    const lockedEntityId = lockedEntityIdRef.current;
    setEntitySwitchPolicy({ canSwitch: false, lockedEntityId });

    if (entityId !== lockedEntityId) {
      setEntityId(lockedEntityId);
    }
  }, [entityId, loading, role, setEntityId]);

  useEffect(() => {
    return () => resetEntitySwitchPolicy();
  }, []);

  return null;
}
