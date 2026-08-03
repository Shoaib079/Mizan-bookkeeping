"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";

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
import {
  countInactiveDirectoryRows,
  directoryInactiveSplitIndex,
  sortDirectoryActiveFirst,
} from "@/lib/directory-list";

type StaffRowWithBalance = EmployeeRow & {
  balance_minor: number | null;
  balanceLoading: boolean;
};

type LedgerResponse = { balance_minor: number };

export function StaffBalancesTable() {
  const { entityId } = useEntity();
  const [showInactive, setShowInactive] = useState(false);
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
        `/entities/${entityId}/staff/employees?include_inactive=${showInactive ? "true" : "false"}&limit=100`,
      );
      const ordered = sortDirectoryActiveFirst(list.items);
      const initial: StaffRowWithBalance[] = ordered.map((employee) => ({
        ...employee,
        balance_minor: null,
        balanceLoading: true,
      }));
      setRows(initial);
      setLoading(false);

      await Promise.all(
        ordered.map(async (employee) => {
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
                  ? { ...row, balance_minor: null, balanceLoading: false }
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
  }, [entityId, showInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inactiveSplitAt = useMemo(
    () => (showInactive ? directoryInactiveSplitIndex(rows) : undefined),
    [rows, showInactive],
  );
  const inactiveCount = useMemo(
    () => countInactiveDirectoryRows(rows),
    [rows],
  );
  const activeCount = showInactive ? rows.length - inactiveCount : rows.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {entityId
              ? showInactive
                ? `${activeCount} active · ${inactiveCount} inactive`
                : `${rows.length} active employee${rows.length === 1 ? "" : "s"}`
              : "Select a restaurant in the sidebar"}
          </p>
          {entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive employees
            </label>
          )}
        </div>
        {entityId && (
          <Link href="/staff" className="text-sm text-primary hover:underline">
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
            {rows.map((row, index) => (
              <Fragment key={row.id}>
                {inactiveSplitAt !== undefined && index === inactiveSplitAt && (
                  <DataTableRow className="bg-muted/30 hover:bg-muted/30">
                    <DataTableCell
                      colSpan={4}
                      className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Inactive employees
                    </DataTableCell>
                  </DataTableRow>
                )}
                <DataTableRow>
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
                      : row.balance_minor === null
                        ? "—"
                        : formatStaffBalanceMinor(
                            row.balance_minor,
                            row.pay_currency,
                          )}
                  </DataTableCell>
                </DataTableRow>
              </Fragment>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
