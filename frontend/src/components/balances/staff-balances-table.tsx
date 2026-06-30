"use client";

import Link from "next/link";
import { UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { EmployeeRow } from "@/components/forms/employee-form";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
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
import { formatStaffBalanceMinor } from "@/lib/format-staff-balance";

type StaffRowWithBalance = EmployeeRow & {
  balance_minor: number | null;
  balanceLoading: boolean;
};

type LedgerResponse = { balance_minor: number };

export function StaffBalancesTable() {
  const { entityId } = useEntity();
  const [rows, setRows] = useState<StaffRowWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<{ items: EmployeeRow[] }>(
        `/entities/${entityId}/staff/employees?include_inactive=true&limit=100`,
      );
      const initial: StaffRowWithBalance[] = list.items.map((employee) => ({
        ...employee,
        balance_minor: null,
        balanceLoading: true,
      }));
      setRows(initial);
      setLoading(false);

      await Promise.all(
        list.items.map(async (employee) => {
          try {
            const ledger = await apiFetch<LedgerResponse>(
              `/entities/${entityId}/staff/employees/${employee.id}/ledger`,
            );
            setRows((prev) =>
              prev.map((row) =>
                row.id === employee.id
                  ? {
                      ...row,
                      balance_minor: ledger.balance_minor,
                      balanceLoading: false,
                    }
                  : row,
              ),
            );
          } catch {
            setRows((prev) =>
              prev.map((row) =>
                row.id === employee.id
                  ? { ...row, balance_minor: 0, balanceLoading: false }
                  : row,
              ),
            );
          }
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? "Salary and advance balances per employee"
            : "Select a restaurant in the sidebar"}
        </p>
        {entityId && (
          <Link
            href="/staff"
            className="text-sm text-primary hover:underline"
          >
            Staff directory →
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && rows.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title="No employees yet"
          hint="Add staff under Record or from the employee directory."
        />
      )}

      {rows.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Pay currency</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/staff/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.pay_currency}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </DataTableCell>
                <DataTableCell align="right" className="tabular-nums">
                  {row.balanceLoading
                    ? "…"
                    : formatStaffBalanceMinor(
                        row.balance_minor ?? 0,
                        row.pay_currency,
                      )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
