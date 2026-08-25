"use client";

/** State, loaders, and dialog wiring for CustomerDetailPage. */

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { CorrectableCreditSaleRow } from "@/components/forms/correct-credit-sale-form";
import type { CorrectableCustomerPaymentRow } from "@/components/forms/correct-customer-payment-form";
import type { CorrectableWriteOffRow } from "@/components/forms/customer-write-off-dialog";
import type { CustomerRow } from "@/components/forms/customer-form";
import type {
  CustomerLedgerEditTarget,
  CustomerLedgerVoidTarget,
} from "@/components/customers/customer-ledger-row-actions";
import type { CustomerLedgerResponse } from "@/components/customers/customer-detail-ledger-helpers";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

export function useCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { entityId } = useEntity();

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [correctWriteOff, setCorrectWriteOff] =
    useState<CorrectableWriteOffRow | null>(null);
  const [correctPayment, setCorrectPayment] =
    useState<CorrectableCustomerPaymentRow | null>(null);
  const [correctCreditSale, setCorrectCreditSale] =
    useState<CorrectableCreditSaleRow | null>(null);
  const [groupSaleEditId, setGroupSaleEditId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<CustomerLedgerVoidTarget | null>(
    null,
  );

  /** One place that turns "Edit was pressed on this row" into an open dialog.
   *
   * The decision of *what* to open belongs to the row and lives beside the
   * button in `customer-ledger-row-actions.tsx`; this is only the wiring from
   * that answer to the dialog's state.
   */
  function openEdit(target: CustomerLedgerEditTarget) {
    switch (target.kind) {
      case "group_sale":
        return setGroupSaleEditId(target.groupSaleId);
      case "write_off":
        return setCorrectWriteOff(target);
      case "payment":
        return setCorrectPayment(target);
      case "credit_sale":
        return setCorrectCreditSale(target);
    }
  }

  const reload = useCallback(async () => {
    if (!entityId || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [cust, led] = await Promise.all([
        apiFetch<CustomerRow>(
          `/entities/${entityId}/customers/${customerId}`,
        ),
        apiFetch<CustomerLedgerResponse>(
          `/entities/${entityId}/customers/${customerId}/ledger`,
        ),
      ]);
      setCustomer(cust);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, customerId]);

  useEffect(() => {
    setCorrectPayment(null);
    void reload();
  }, [reload]);

  const { showHistory, setShowHistory, hiddenCount, visibleRows } =
    useLedgerHistoryView(ledger?.entries ?? []);

  return {
    entityId,
    customerId,
    customer,
    ledger,
    loading,
    error,
    editOpen,
    setEditOpen,
    saleOpen,
    setSaleOpen,
    paymentOpen,
    setPaymentOpen,
    writeOffOpen,
    setWriteOffOpen,
    correctWriteOff,
    setCorrectWriteOff,
    correctPayment,
    setCorrectPayment,
    correctCreditSale,
    setCorrectCreditSale,
    groupSaleEditId,
    setGroupSaleEditId,
    voidTarget,
    setVoidTarget,
    openEdit,
    reload,
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  };
}
