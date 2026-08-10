"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";
import {
  filterExpenseAccounts,
  filterRevenueAccounts,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";

export type MoneyAccountOption = { id: string; name: string; account_kind: string };
export type SupplierOption = { id: string; name: string };
export type CustomerOption = { id: string; name: string };
export type EmployeeOption = { id: string; name: string };
export type PartnerOption = { id: string; name: string };

export type StatementClassificationPickers = {
  suppliers: SupplierOption[];
  customers: CustomerOption[];
  employees: EmployeeOption[];
  partners: PartnerOption[];
  moneyAccounts: MoneyAccountOption[];
  creditCards: MoneyAccountOption[];
  expenseAccounts: ChartAccount[];
  /** Revenue accounts only — an inflow credits its offset, so crediting an
   * expense here would book a refund instead of income. */
  incomeAccounts: ChartAccount[];
  deliveryPlatforms: DeliveryPlatform[];
  deliveryPlatformsError: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  appendExpenseAccount: (account: ChartAccount) => void;
};

export function deliveryPlatformComboboxOptions(
  platforms: DeliveryPlatform[],
): { value: string; label: string }[] {
  return platforms.map((platform) => ({
    value: platform.id,
    label: platform.is_active ? platform.name : `${platform.name} (inactive)`,
  }));
}

export function useStatementClassificationPickers(
  entityId: string,
): StatementClassificationPickers {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccountOption[]>([]);
  const [creditCards, setCreditCards] = useState<MoneyAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<ChartAccount[]>([]);
  const [deliveryPlatforms, setDeliveryPlatforms] = useState<DeliveryPlatform[]>([]);
  const [deliveryPlatformsError, setDeliveryPlatformsError] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    setDeliveryPlatformsError(null);
    try {
      const [supRes, custRes, empRes, partRes, acctRes, ccRes, chartRes] =
        await Promise.all([
          apiFetch<{ items: SupplierOption[] }>(
            `/entities/${entityId}/suppliers?limit=200`,
          ),
          apiFetch<{ items: CustomerOption[] }>(
            `/entities/${entityId}/customers?limit=200`,
          ),
          apiFetch<{ items: EmployeeOption[] }>(
            `/entities/${entityId}/staff/employees?limit=200`,
          ).catch(() => ({ items: [] as EmployeeOption[] })),
          apiFetch<{ items: PartnerOption[] }>(
            `/entities/${entityId}/partners?limit=200`,
          ).catch(() => ({ items: [] as PartnerOption[] })),
          apiFetch<{ items: MoneyAccountOption[] }>(
            `/entities/${entityId}/banking/accounts?limit=100`,
          ),
          apiFetch<{ items: MoneyAccountOption[] }>(
            `/entities/${entityId}/banking/accounts?account_kind=credit_card&limit=50`,
          ),
          apiFetch<{ items: ChartAccount[] }>(
            `/entities/${entityId}/chart-of-accounts?limit=200`,
          ),
        ]);
      setSuppliers(supRes.items);
      setCustomers(custRes.items);
      setEmployees(empRes.items);
      setPartners(partRes.items);
      setMoneyAccounts(acctRes.items);
      setCreditCards(ccRes.items);
      setExpenseAccounts(filterExpenseAccounts(chartRes.items));
      setIncomeAccounts(filterRevenueAccounts(chartRes.items));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pickers");
      setLoading(false);
      return;
    }

    try {
      const platRes = await apiFetch<{ items: DeliveryPlatform[] }>(
        `/entities/${entityId}/delivery/platforms?include_inactive=true&limit=200`,
      );
      setDeliveryPlatforms(platRes.items);
    } catch (err) {
      setDeliveryPlatforms([]);
      setDeliveryPlatformsError(
        err instanceof Error ? err.message : "Failed to load delivery platforms",
      );
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const appendExpenseAccount = useCallback((account: ChartAccount) => {
    setExpenseAccounts((prev) => mergeExpenseAccounts(prev, account));
  }, []);

  /* Memoised because callers put this object in effect dependencies.
   *
   * A fresh literal every render meant the identity changed whenever anything
   * above re-rendered — a poll finishing, a window refocus, an unrelated bit
   * of state — and the classify bar re-hydrated its form each time, replacing
   * whatever had been chosen and not yet posted. The lists had not changed;
   * only the object holding them had. */
  return useMemo(
    () => ({
      suppliers,
      customers,
      employees,
      partners,
      moneyAccounts,
      creditCards,
      expenseAccounts,
      incomeAccounts,
      deliveryPlatforms,
      deliveryPlatformsError,
      loading,
      error,
      reload,
      appendExpenseAccount,
    }),
    [
      suppliers,
      customers,
      employees,
      partners,
      moneyAccounts,
      creditCards,
      expenseAccounts,
      incomeAccounts,
      deliveryPlatforms,
      deliveryPlatformsError,
      loading,
      error,
      reload,
      appendExpenseAccount,
    ],
  );
}
