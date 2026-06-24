"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { EmployeeForm, type EmployeeRow } from "@/components/forms/employee-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { staffMovementLabels } from "@/lib/subledger-labels";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_minor: number;
  description: string;
};

type LedgerResponse = {
  balance_minor: number;
  entries: LedgerEntry[];
};

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id;
  const { entityId } = useEntity();

  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId || !employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [emp, led] = await Promise.all([
        apiFetch<EmployeeRow>(
          `/entities/${entityId}/staff/employees/${employeeId}`,
        ),
        apiFetch<LedgerResponse>(
          `/entities/${entityId}/staff/employees/${employeeId}/ledger`,
        ),
      ]);
      setEmployee(emp);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, employeeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const balanceLabel =
    employee?.pay_currency === "TRY"
      ? formatTry(ledger?.balance_minor ?? 0)
      : `${((ledger?.balance_minor ?? 0) / 100).toFixed(2)} ${employee?.pay_currency ?? ""}`;

  if (!entityId) {
    return (
      <AppShell title="Staff">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={employee?.name ?? "Employee"}>
      <div className="mb-4">
        <Link href="/staff" className="text-sm text-primary hover:underline">
          ← Staff
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading employee…</p>
      )}

      {employee && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Pay currency: {employee.pay_currency}
              </p>
              <StatusBadge
                status={employee.is_active ? "active" : "inactive"}
              />
              {employee.notes && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {employee.notes}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Staff balance</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {balanceLabel}
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button type="button" onClick={() => setAccrualOpen(true)}>
              Salary accrual
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdvanceOpen(true)}>
              Advance
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(true)}>
              Salary payment
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Ledger</h2>
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Type</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {ledger.entries.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell>
                      {formatTrDate(entry.movement_date)}
                    </DataTableCell>
                    <DataTableCell>
                      {staffMovementLabels[entry.movement_type] ??
                        entry.movement_type}
                    </DataTableCell>
                    <DataTableCell>{entry.description}</DataTableCell>
                    <DataTableCell align="right">
                      {employee.pay_currency === "TRY"
                        ? formatTry(entry.amount_minor)
                        : `${(entry.amount_minor / 100).toFixed(2)} ${employee.pay_currency}`}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </>
      )}

      {employee && (
        <>
          <EmployeeForm
            open={editOpen}
            employee={employee}
            onClose={() => setEditOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffAccrualForm
            open={accrualOpen}
            employeeId={employeeId}
            payCurrency={employee.pay_currency}
            onClose={() => setAccrualOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffCashMovementForm
            open={advanceOpen}
            kind="advance"
            employeeId={employeeId}
            payCurrency={employee.pay_currency}
            onClose={() => setAdvanceOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffCashMovementForm
            open={paymentOpen}
            kind="payment"
            employeeId={employeeId}
            payCurrency={employee.pay_currency}
            onClose={() => setPaymentOpen(false)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </AppShell>
  );
}
