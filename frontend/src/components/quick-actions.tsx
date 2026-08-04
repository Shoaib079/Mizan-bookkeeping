"use client";

/** Shared quick-action dialogs — New menu, command palette, Record hub (UX1). */

import { useRouter } from "next/navigation";
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
import { useApiAuth } from "@/lib/api-auth";
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
import { canUseRecordAction } from "@/lib/entity-access";
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
  openRecordActionWithFile: (key: RecordActionKey, file: File) => void;
  openQuickAction: (key: QuickActionKey) => void;
  closeQuickAction: () => void;
  deliveryEnabled: boolean;
  refreshDeliveryEnabled: () => Promise<void>;
};

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null);

/** Actions that navigate to an owning page instead of opening a dialog.
 *
 * Deliberately empty: recording from Add should keep you in Add. The forms are
 * dialog components shared with their owning pages, so hosting them here is one
 * implementation with two entry points — not a duplicate. Pages still honour
 * `?new=1` for deep links. */
export const RECORD_ACTION_PAGE_HREFS: Partial<Record<RecordActionKey, string>> = {
  splitExpense: "/split",
};

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { isAuthReady } = useApiAuth();
  const { canWriteDailyTransactions, grants } = useEntityAccess();
  const [active, setActive] = useState<RecordActionKey | null>(null);
  const [documentRoute, setDocumentRoute] = useState<{
    key: RecordActionKey;
    file: File;
  } | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(() => {
    if (!entityId) return false;
    return getCachedDeliveryEnabled(entityId) ?? false;
  });

  const refreshDeliveryEnabled = useCallback(async () => {
    if (!entityId || !isAuthReady) return;
    const enabled = await refreshDeliveryEnabledForEntity(entityId);
    if (enabled !== null) setDeliveryEnabled(enabled);
  }, [entityId, isAuthReady]);

  useEffect(() => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }

    const cached = getCachedDeliveryEnabled(entityId);
    if (cached !== undefined) {
      setDeliveryEnabled(cached);
    }

    if (!isAuthReady) return;

    let cancelled = false;
    void fetchDeliveryEnabled(entityId).then((enabled) => {
      if (!cancelled && enabled !== null) setDeliveryEnabled(enabled);
    });

    return () => {
      cancelled = true;
    };
  }, [entityId, isAuthReady]);

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
      if (!canWriteDailyTransactions || !canUseRecordAction(grants, key)) return;
      if (key === "deliveryReport" && !deliveryEnabled) return;
      if (entityId) recordActionUsage(entityId, key);
      const pageHref = RECORD_ACTION_PAGE_HREFS[key];
      if (pageHref) {
        router.push(pageHref);
        return;
      }
      setDocumentRoute(null);
      setActive(key);
    },
    [canWriteDailyTransactions, deliveryEnabled, entityId, grants, router],
  );

  const openRecordActionWithFile = useCallback(
    (key: RecordActionKey, file: File) => {
      if (!canWriteDailyTransactions || !canUseRecordAction(grants, key)) return;
      if (entityId) recordActionUsage(entityId, key);
      setDocumentRoute({ key, file });
      setActive(key);
    },
    [canWriteDailyTransactions, entityId, grants],
  );

  const closeQuickAction = useCallback(() => {
    setActive(null);
    setDocumentRoute(null);
  }, []);

  const openQuickAction = useCallback(
    (key: QuickActionKey) => {
      openRecordAction(key);
    },
    [openRecordAction],
  );

  const value = useMemo(
    () => ({
      active,
      openRecordAction,
      openRecordActionWithFile,
      openQuickAction,
      closeQuickAction: closeQuickAction,
      deliveryEnabled,
      refreshDeliveryEnabled,
    }),
    [
      active,
      openRecordAction,
      openRecordActionWithFile,
      openQuickAction,
      closeQuickAction,
      deliveryEnabled,
      refreshDeliveryEnabled,
    ],
  );

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <RecordActionModals
        active={active}
        onClose={closeQuickAction}
        routedFile={documentRoute?.file ?? null}
        routedTo={documentRoute?.key ?? null}
      />
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
