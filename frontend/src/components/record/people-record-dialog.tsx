"use client";

/** Record hub people actions — pick person and enter fields in one dialog. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomerCreditSaleForm } from "@/components/forms/customer-credit-sale-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import type { EmployeeRow } from "@/components/forms/employee-form";
import { PartnerExpenseFrontedForm } from "@/components/forms/partner-expense-fronted-form";
import { PartnerCashMovementForm } from "@/components/forms/partner-cash-movement-form";
import type { PartnerRow } from "@/components/forms/partner-form";
import { PartnerReimbursementForm } from "@/components/forms/partner-reimbursement-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { SupplierPaymentForm } from "@/components/forms/supplier-payment-form";
import type { SupplierRow } from "@/components/forms/supplier-form";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { PersonPickerKind, RecordActionKey } from "@/lib/record-actions";

type CustomerRow = { id: string; name: string };

export type PersonPickerResult = {
  id: string;
  name: string;
  payCurrency?: string;
  balanceKurus?: number;
};

type Props = {
  open: boolean;
  action: RecordActionKey;
  title: string;
  kind: PersonPickerKind;
  onClose: () => void;
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

const NEEDS_LEDGER_BALANCE = new Set<RecordActionKey>([
  "partnerReimbursement",
  "partnerDrawing",
  "partnerDrawingRepayment",
  "customerPayment",
  "supplierPayment",
]);

export function PeopleRecordDialog({
  open,
  action,
  title,
  kind,
  onClose,
}: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<PersonPickerResult[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [balanceKurus, setBalanceKurus] = useState<number | undefined>(
    undefined,
  );
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setItems([]);
    setSelectedId("");
    setLoadError(null);
    setLoading(false);
    setBalanceKurus(undefined);
    setBalanceLoading(false);
    setBalanceError(null);
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

  useEffect(() => {
    if (!open || !entityId || !selectedId) {
      setBalanceKurus(undefined);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }
    if (!NEEDS_LEDGER_BALANCE.has(action)) {
      setBalanceKurus(undefined);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }

    let cancelled = false;
    setBalanceLoading(true);
    setBalanceError(null);

    const ledgerPath = LEDGER_PATH[kind]?.(selectedId);
    if (!ledgerPath) {
      setBalanceLoading(false);
      return;
    }

    void apiFetch<LedgerBalance>(`/entities/${entityId}${ledgerPath}`)
      .then((ledger) => {
        if (cancelled) return;
        setBalanceKurus(ledger.balance_kurus);
      })
      .catch((err) => {
        if (cancelled) return;
        setBalanceError(
          err instanceof Error ? err.message : "Failed to load balance",
        );
        setBalanceKurus(undefined);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, kind, action, selectedId]);

  const options = useMemo(
    () => items.map((item) => ({ value: item.id, label: item.name })),
    [items],
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const formReady =
    Boolean(selected) &&
    (!NEEDS_LEDGER_BALANCE.has(action) || (!balanceLoading && !balanceError));

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} title={title} onClose={handleClose}>
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

          {balanceLoading && (
            <p className="text-sm text-muted-foreground">Loading balance…</p>
          )}
          {balanceError && (
            <p className="text-sm text-destructive">{balanceError}</p>
          )}

          {formReady && selected && (
            <div key={selected.id} className="border-t border-border pt-4">
              {renderEmbeddedForm(action, selected, balanceKurus, handleClose)}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function renderEmbeddedForm(
  action: RecordActionKey,
  person: PersonPickerResult,
  balanceKurus: number | undefined,
  onClose: () => void,
) {
  const payCurrency = person.payCurrency ?? "TRY";
  const formProps = { embedded: true as const, open: true, onClose };

  switch (action) {
    case "staffAccrual":
      return (
        <StaffAccrualForm
          {...formProps}
          employeeId={person.id}
          payCurrency={payCurrency}
        />
      );
    case "staffAdvance":
      return (
        <StaffCashMovementForm
          {...formProps}
          employeeId={person.id}
          kind="advance"
          payCurrency={payCurrency}
        />
      );
    case "staffPayment":
      return (
        <StaffCashMovementForm
          {...formProps}
          employeeId={person.id}
          kind="payment"
          payCurrency={payCurrency}
        />
      );
    case "partnerExpenseFronted":
      return (
        <PartnerExpenseFrontedForm {...formProps} partnerId={person.id} />
      );
    case "partnerReimbursement":
      return (
        <PartnerReimbursementForm
          {...formProps}
          partnerId={person.id}
          balanceKurus={balanceKurus}
        />
      );
    case "partnerDrawing":
      return (
        <PartnerCashMovementForm
          {...formProps}
          partnerId={person.id}
          kind="drawing"
          balanceKurus={balanceKurus}
        />
      );
    case "partnerDrawingRepayment":
      return (
        <PartnerCashMovementForm
          {...formProps}
          partnerId={person.id}
          kind="repayment"
          balanceKurus={balanceKurus}
        />
      );
    case "customerCreditSale":
      return (
        <CustomerCreditSaleForm {...formProps} customerId={person.id} />
      );
    case "customerPayment":
      return (
        <CustomerPaymentForm
          {...formProps}
          customerId={person.id}
          balanceKurus={balanceKurus}
        />
      );
    case "supplierPayment":
      return (
        <SupplierPaymentForm
          {...formProps}
          supplierId={person.id}
          balanceKurus={balanceKurus}
        />
      );
    default:
      return null;
  }
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
