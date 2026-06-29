"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import type { EmployeeRow } from "@/components/forms/employee-form";
import type { PartnerRow } from "@/components/forms/partner-form";
import type { SupplierRow } from "@/components/forms/supplier-form";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { PersonPickerKind } from "@/lib/record-actions";

type CustomerRow = { id: string; name: string };

export type PersonPickerResult = {
  id: string;
  name: string;
  payCurrency?: string;
  balanceKurus?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  kind: PersonPickerKind;
  title: string;
  onContinue: (result: PersonPickerResult) => void;
};

type LedgerBalance = { balance_kurus: number };

const LIST_PATH: Record<PersonPickerKind, string> = {
  staff: "/staff/employees",
  partner: "/partners",
  customer: "/customers",
  supplier: "/suppliers",
};

const LEDGER_PATH: Partial<Record<PersonPickerKind, (id: string) => string>> = {
  partner: (id) => `/partners/${id}/ledger`,
  customer: (id) => `/customers/${id}/ledger`,
  supplier: (id) => `/suppliers/${id}/ledger`,
};

export function PersonPickerDialog({
  open,
  onClose,
  kind,
  title,
  onContinue,
}: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<PersonPickerResult[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [continuing, setContinuing] = useState(false);

  const reset = useCallback(() => {
    setItems([]);
    setSelectedId("");
    setLoadError(null);
    setLoading(false);
    setContinuing(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!entityId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void apiFetch<{ items: unknown[] }>(
      `/entities/${entityId}${LIST_PATH[kind]}?limit=100`,
    )
      .then((res) => {
        if (cancelled) return;
        const mapped = res.items.map((row) => mapRow(kind, row));
        setItems(mapped);
        if (mapped[0]) setSelectedId(mapped[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load list");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, kind, reset]);

  const options = useMemo(
    () => items.map((item) => ({ value: item.id, label: item.name })),
    [items],
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function handleContinue() {
    if (!entityId || !selected) return;
    setContinuing(true);
    setLoadError(null);
    try {
      let balanceKurus = selected.balanceKurus;
      const ledgerPath = LEDGER_PATH[kind]?.(selected.id);
      if (ledgerPath) {
        const ledger = await apiFetch<LedgerBalance>(
          `/entities/${entityId}${ledgerPath}`,
        );
        balanceKurus = ledger.balance_kurus;
      }
      onContinue({ ...selected, balanceKurus });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setContinuing(false);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar first.
        </p>
      )}

      {entityId && loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {entityId && !loading && loadError && (
        <p className="text-sm text-destructive">{loadError}</p>
      )}

      {entityId && !loading && !loadError && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No {kindLabel(kind)} found — add one from Balances or the directory
          first.
        </p>
      )}

      {entityId && !loading && items.length > 0 && (
        <div className="space-y-4">
          <div>
            <Label>{pickerLabel(kind)}</Label>
            <Combobox
              value={selectedId}
              onValueChange={setSelectedId}
              options={options}
              placeholder={`Choose ${kindLabel(kind)}…`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selected || continuing}
              onClick={() => void handleContinue()}
            >
              {continuing ? "Loading…" : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function mapRow(kind: PersonPickerKind, row: unknown): PersonPickerResult {
  if (kind === "staff") {
    const employee = row as EmployeeRow;
    return {
      id: employee.id,
      name: employee.name,
      payCurrency: employee.pay_currency,
    };
  }
  if (kind === "partner") {
    const partner = row as PartnerRow;
    return { id: partner.id, name: partner.name };
  }
  if (kind === "customer") {
    const customer = row as CustomerRow;
    return { id: customer.id, name: customer.name };
  }
  const supplier = row as SupplierRow;
  return { id: supplier.id, name: supplier.name };
}

function kindLabel(kind: PersonPickerKind): string {
  switch (kind) {
    case "staff":
      return "employees";
    case "partner":
      return "partners";
    case "customer":
      return "customers";
    case "supplier":
      return "suppliers";
  }
}

function pickerLabel(kind: PersonPickerKind): string {
  switch (kind) {
    case "staff":
      return "Employee";
    case "partner":
      return "Partner";
    case "customer":
      return "Customer";
    case "supplier":
      return "Supplier";
  }
}
