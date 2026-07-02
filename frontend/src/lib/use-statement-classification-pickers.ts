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
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const [supRes, custRes, empRes, partRes, acctRes, ccRes, chartRes, platRes] =
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
          apiFetch<{ items: DeliveryPlatform[] }>(
            `/entities/${entityId}/delivery/platforms?limit=50`,
          ).catch(() => ({ items: [] as DeliveryPlatform[] })),
        ]);
      setSuppliers(supRes.items);
      setCustomers(custRes.items);
      setEmployees(empRes.items);
      setPartners(partRes.items);
      setMoneyAccounts(acctRes.items);
      setCreditCards(ccRes.items);
      setExpenseAccounts(chartRes.items.filter((a) => a.code.startsWith("5")));
      setDeliveryPlatforms(platRes.items.filter((p) => p.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pickers");
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
    loading,
    error,
    reload,
  };
}
