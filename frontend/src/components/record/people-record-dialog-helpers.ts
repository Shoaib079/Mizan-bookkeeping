/** People record dialog — path maps, row mapping, and kind labels. */

import type { EmployeeRow } from "@/components/forms/employee-form";
import type { PartnerRow } from "@/components/forms/partner-form";
import type { SupplierRow } from "@/components/forms/supplier-form";
import type { PersonPickerKind, RecordActionKey } from "@/lib/record-actions";

export type PersonPickerResult = {
  id: string;
  name: string;
  payCurrency?: string;
  balanceKurus?: number;
};

type CustomerRow = { id: string; name: string };

export type LedgerBalance = {
  balance_kurus: number;
  capital_balance_kurus?: number;
  unpaid_profit_kurus?: number;
};

export const LIST_PATH: Record<PersonPickerKind, string> = {
  staff: "/staff/employees",
  partner: "/partners",
  customer: "/customers",
  supplier: "/suppliers",
};

export const LEDGER_PATH: Partial<
  Record<PersonPickerKind, (id: string) => string>
> = {
  partner: (id) => `/partners/${id}/ledger`,
  customer: (id) => `/customers/${id}/ledger`,
  supplier: (id) => `/suppliers/${id}/ledger`,
};

export const STAFF_DATE_ACTIONS = new Set<RecordActionKey>([
  "staffAccrual",
  "staffAdvance",
  "staffPayment",
]);

export const NEEDS_REIMBURSEMENT_BALANCE = new Set<RecordActionKey>([
  "customerPayment",
  "supplierPayment",
]);

export function mapPersonRow(
  kind: PersonPickerKind,
  row: unknown,
): PersonPickerResult {
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

export function kindLabel(kind: PersonPickerKind): string {
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

export function pickerLabel(kind: PersonPickerKind): string {
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
