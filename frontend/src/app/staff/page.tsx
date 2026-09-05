"use client";

/** Staff list — DESIGN_ARCHETYPES §3 (`ListPage`). */

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { EmployeeForm, type EmployeeRow } from "@/components/forms/employee-form";
import { AppShell } from "@/components/layout/app-shell";
import { ListPage } from "@/components/page/list-page";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { UsersRound } from "lucide-react";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";
import { useLedgerBalanceMap } from "@/lib/use-ledger-balance-map";
import { DirectoryBalanceCell } from "@/components/directory-balance-cell";
import { formatStaffBalanceMinor } from "@/lib/format-staff-balance";
import {
  countInactiveDirectoryRows,
  directoryInactiveSplitIndex,
  sortDirectoryActiveFirst,
} from "@/lib/directory-list";

function StaffCardList({
  items,
  balances,
  balancesLoading,
  inactiveSplitAt,
}: {
  items: EmployeeRow[];
  balances: Map<string, number>;
  balancesLoading: boolean;
  inactiveSplitAt?: number;
}) {
  return (
    <MobileCardList>
      {items.map((row, index) => (
        <Fragment key={row.id}>
          {inactiveSplitAt !== undefined && index === inactiveSplitAt && (
            <p className="mb-2 mt-4 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Inactive employees
            </p>
          )}
          <MobileCardRow
            href={`/staff/${row.id}`}
            title={row.name}
            meta={
              <>
                <span>{row.pay_currency}</span>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </>
            }
            amount={
              <DirectoryBalanceCell
                balanceMinor={
                  balances.has(row.id) ? balances.get(row.id) : undefined
                }
                party="employee"
                loading={balancesLoading && !balances.has(row.id)}
                formatAbs={(abs) =>
                  formatStaffBalanceMinor(abs, row.pay_currency)
                }
              />
            }
          />
        </Fragment>
      ))}
    </MobileCardList>
  );
}

function StaffTable({
  items,
  balances,
  balancesLoading,
  inactiveSplitAt,
}: {
  items: EmployeeRow[];
  balances: Map<string, number>;
  balancesLoading: boolean;
  inactiveSplitAt?: number;
}) {
  return (
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
        {items.map((row, index) => (
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
            <DataTableRow href={`/staff/${row.id}`}>
              <DataTableCell>
                <Link
                  href={`/staff/${row.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.name}
                </Link>
              </DataTableCell>
              <DataTableCell>{row.pay_currency}</DataTableCell>
              <DataTableCell>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </DataTableCell>
              <DataTableCell align="right">
                <DirectoryBalanceCell
                  balanceMinor={
                    balances.has(row.id) ? balances.get(row.id) : undefined
                  }
                  party="employee"
                  loading={balancesLoading && !balances.has(row.id)}
                  formatAbs={(abs) =>
                    formatStaffBalanceMinor(abs, row.pay_currency)
                  }
                />
              </DataTableCell>
            </DataTableRow>
          </Fragment>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export default function StaffPage() {
  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();
  const [showInactive, setShowInactive] = useState(false);
  const listPath = useMemo(
    () => `/staff/employees?include_inactive=${showInactive ? "true" : "false"}`,
    [showInactive],
  );
  const {
    items,
    total,
    loading,
    error,
    forbidden,
    reload,
    offset,
    setOffset,
    pageSize,
  } = useEntityList<EmployeeRow>(listPath, entityId);
  const displayRows = useMemo(() => sortDirectoryActiveFirst(items), [items]);
  const inactiveSplitAt = useMemo(
    () => (showInactive ? directoryInactiveSplitIndex(displayRows) : undefined),
    [displayRows, showInactive],
  );
  const employeeIds = useMemo(() => displayRows.map((row) => row.id), [displayRows]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    employeeIds,
    (id) => `/staff/employees/${id}/ledger`,
    (res) => (res as { balance_minor: number }).balance_minor,
  );
  const [formOpen, setFormOpen] = useState(false);

  const inactiveCount = useMemo(
    () => countInactiveDirectoryRows(displayRows),
    [displayRows],
  );
  const activeCount = showInactive ? displayRows.length - inactiveCount : total;

  const listProps = {
    items: displayRows,
    balances,
    balancesLoading,
    inactiveSplitAt,
  };

  return (
    <AppShell title="Staff">
      <ListPage
        title="Team directory"
      hideTitleOnDesktop
        loading={loading}
        error={error}
        forbidden={
          entityId && forbidden ? (
            <ForbiddenMessage context="staff list" />
          ) : undefined
        }
        primaryAction={
          showWrite ? (
            <Button
              type="button"
              disabled={!entityId}
              onClick={() => setFormOpen(true)}
            >
              New employee
            </Button>
          ) : undefined
        }
        toolbar={
          entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive employees
            </label>
          )
        }
        countLabel={
          entityId
            ? showInactive
              ? `${activeCount} active · ${inactiveCount} inactive`
              : `${total} active employee${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"
        }
        skeletonColumns={4}
        isEmpty={Boolean(entityId) && displayRows.length === 0}
        empty={
          <EmptyState
            icon={UsersRound}
            title="No employees yet"
            hint="Add staff to track salary accruals, advances, and payments."
          />
        }
        table={<StaffTable {...listProps} />}
        mobile={<StaffCardList {...listProps} />}
        pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
      >
        <EmployeeForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
        />
      </ListPage>
    </AppShell>
  );
}
