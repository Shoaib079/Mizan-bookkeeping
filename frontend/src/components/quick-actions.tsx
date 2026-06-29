"use client";

/** Shared quick-action dialogs — New menu, top bar, dashboard (Slice 11.14). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { FxPurchaseQuickAction } from "@/components/forms/fx-purchase-quick-action";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { SupplierForm } from "@/components/forms/supplier-form";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";

export type QuickActionKey =
  | "expense"
  | "sales"
  | "buyFx"
  | "posPhoto"
  | "deliveryReport"
  | "receipt"
  | "supplier"
  | "efatura";

type QuickActionsContextValue = {
  active: QuickActionKey | null;
  openQuickAction: (key: QuickActionKey) => void;
  closeQuickAction: () => void;
  deliveryEnabled: boolean;
};

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { entityId } = useEntity();
  const { canWriteOperations } = useEntityAccess();
  const [active, setActive] = useState<QuickActionKey | null>(null);
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

  const openQuickAction = useCallback(
    (key: QuickActionKey) => {
      if (!canWriteOperations) return;
      if (key === "deliveryReport" && !deliveryEnabled) return;
      setActive(key);
    },
    [canWriteOperations, deliveryEnabled],
  );

  const closeQuickAction = useCallback(() => setActive(null), []);

  const value = useMemo(
    () => ({
      active,
      openQuickAction,
      closeQuickAction,
      deliveryEnabled,
    }),
    [active, openQuickAction, closeQuickAction, deliveryEnabled],
  );

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      {canWriteOperations && (
        <>
          <ManualExpenseForm open={active === "expense"} onClose={closeQuickAction} />
          <ManualDailySalesForm open={active === "sales"} onClose={closeQuickAction} />
          <FxPurchaseQuickAction open={active === "buyFx"} onClose={closeQuickAction} />
          <PosSummaryUploadForm open={active === "posPhoto"} onClose={closeQuickAction} />
          <DeliveryReportForm
            open={active === "deliveryReport"}
            onClose={closeQuickAction}
          />
          <ExpenseReceiptUploadForm
            open={active === "receipt"}
            onClose={closeQuickAction}
          />
          <SupplierForm open={active === "supplier"} onClose={closeQuickAction} />
          <EfaturaUploadForm open={active === "efatura"} onClose={closeQuickAction} />
        </>
      )}
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
