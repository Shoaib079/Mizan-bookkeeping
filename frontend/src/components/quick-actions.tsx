"use client";

/** Shared quick-action dialogs — New menu, command palette, Record hub (UX1). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { RecordActionModals } from "@/components/record-action-modals";
import { recordActionUsage } from "@/lib/action-usage";
import { useEntity } from "@/lib/entity-context";
import {
  DELIVERY_ENABLED_CHANGED_EVENT,
  fetchDeliveryEnabled,
  getCachedDeliveryEnabled,
  refreshDeliveryEnabledForEntity,
} from "@/lib/delivery-enabled-cache";
import {
  type QuickActionKey,
  type RecordActionKey,
} from "@/lib/record-actions";
import { useEntityAccess } from "@/lib/use-entity-access";

export type { QuickActionKey, RecordActionKey } from "@/lib/record-actions";
export { isQuickActionKey } from "@/lib/record-actions";
export {
  DELIVERY_ENABLED_CHANGED_EVENT,
  invalidateDeliveryEnabled,
  refreshDeliveryEnabledForEntity,
} from "@/lib/delivery-enabled-cache";

type QuickActionsContextValue = {
  active: RecordActionKey | null;
  openRecordAction: (key: RecordActionKey) => void;
  openQuickAction: (key: QuickActionKey) => void;
  closeQuickAction: () => void;
  deliveryEnabled: boolean;
  refreshDeliveryEnabled: () => Promise<void>;
};

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  const { canWriteOperations } = useEntityAccess();
  const [active, setActive] = useState<RecordActionKey | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(() => {
    if (!entityId) return false;
    return getCachedDeliveryEnabled(entityId) ?? false;
  });

  const refreshDeliveryEnabled = useCallback(async () => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }
    const enabled = await refreshDeliveryEnabledForEntity(entityId);
    setDeliveryEnabled(enabled);
  }, [entityId]);

  useEffect(() => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }

    let cancelled = false;
    const cached = getCachedDeliveryEnabled(entityId);
    setDeliveryEnabled(cached ?? false);

    void fetchDeliveryEnabled(entityId).then((enabled) => {
      if (!cancelled) setDeliveryEnabled(enabled);
    });

    return () => {
      cancelled = true;
    };
  }, [entityId]);

  useEffect(() => {
    if (!entityId) return;

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ entityId: string }>).detail;
      if (detail.entityId !== entityId) return;
      void refreshDeliveryEnabled();
    };

    window.addEventListener(DELIVERY_ENABLED_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(DELIVERY_ENABLED_CHANGED_EVENT, onChanged);
    };
  }, [entityId, refreshDeliveryEnabled]);

  const openRecordAction = useCallback(
    (key: RecordActionKey) => {
      if (!canWriteOperations) return;
      if (key === "deliveryReport" && !deliveryEnabled) return;
      setActive(key);
      if (entityId) recordActionUsage(entityId, key);
    },
    [canWriteOperations, deliveryEnabled, entityId],
  );

  const openQuickAction = useCallback(
    (key: QuickActionKey) => {
      openRecordAction(key);
    },
    [openRecordAction],
  );

  const closeQuickAction = useCallback(() => setActive(null), []);

  const value = useMemo(
    () => ({
      active,
      openRecordAction,
      openQuickAction,
      closeQuickAction: closeQuickAction,
      deliveryEnabled,
      refreshDeliveryEnabled,
    }),
    [
      active,
      openRecordAction,
      openQuickAction,
      closeQuickAction,
      deliveryEnabled,
      refreshDeliveryEnabled,
    ],
  );

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <RecordActionModals active={active} onClose={closeQuickAction} />
    </QuickActionsContext.Provider>
  );
}

export function useQuickActions() {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) {
    throw new Error("useQuickActions must be used within QuickActionsProvider");
  }
  return ctx;
}

export function useRecordActions() {
  const ctx = useQuickActions();
  return {
    openRecordAction: ctx.openRecordAction,
    deliveryEnabled: ctx.deliveryEnabled,
  };
}
