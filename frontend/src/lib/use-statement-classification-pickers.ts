"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

export type MoneyAccountOption = { id: string; name: string; account_kind: string };
export type SupplierOption = { id: string; name: string };
export type CustomerOption = { id: string; name: string };
export type EmployeeOption = { id: string; name: string };
export type PartnerOption = { id: string; name: string };
export type ChartAccountOption = { id: string; code: string; name_en: string };

export type StatementClassificationPickers = {
  suppliers: SupplierOption[];
  customers: CustomerOption[];
  employees: EmployeeOption[];
  partners: PartnerOption[];
  moneyAccounts: MoneyAccountOption[];
  creditCards: MoneyAccountOption[];
  expenseAccounts: ChartAccountOption[];
  deliveryPlatforms: DeliveryPlatform[];
  deliveryPlatformsError: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
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
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccountOption[]>([]);
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
          apiFetch<{ items: ChartAccountOption[] }>(
            `/entities/${entityId}/chart-of-accounts?limit=200`,
          ),
        ]);
      setSuppliers(supRes.items);
      setCustomers(custRes.items);
      setEmployees(empRes.items);
      setPartners(partRes.items);
      setMoneyAccounts(acctRes.items);
      setCreditCards(ccRes.items);
      setExpenseAccounts(chartRes.items.filter((a) => a.code.startsWith("5")));
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

  return {
    suppliers,
    customers,
    employees,
    partners,
    moneyAccounts,
    creditCards,
    expenseAccounts,
    deliveryPlatforms,
    deliveryPlatformsError,
    loading,
    error,
    reload,
  };
}
