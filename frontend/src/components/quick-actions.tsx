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
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import {
  type QuickActionKey,
  type RecordActionKey,
} from "@/lib/record-actions";
import { useEntityAccess } from "@/lib/use-entity-access";

export type { QuickActionKey, RecordActionKey } from "@/lib/record-actions";
export { isQuickActionKey } from "@/lib/record-actions";

type QuickActionsContextValue = {
  active: RecordActionKey | null;
  openRecordAction: (key: RecordActionKey) => void;
  openQuickAction: (key: QuickActionKey) => void;
  closeQuickAction: () => void;
  deliveryEnabled: boolean;
};

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  const { canWriteOperations } = useEntityAccess();
  const [active, setActive] = useState<RecordActionKey | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }
    void isEntitySettingEnabled(entityId, "delivery_enabled")
      .then(setDeliveryEnabled)
      .catch(() => setDeliveryEnabled(false));
  }, [entityId]);

  const openRecordAction = useCallback(
    (key: RecordActionKey) => {
      if (!canWriteOperations) return;
      if (key === "deliveryReport" && !deliveryEnabled) return;
      setActive(key);
    },
    [canWriteOperations, deliveryEnabled],
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
    }),
    [active, openRecordAction, openQuickAction, closeQuickAction, deliveryEnabled],
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