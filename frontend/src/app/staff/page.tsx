"use client";

import Link from "next/link";
import { useState } from "react";

import { EmployeeForm, type EmployeeRow } from "@/components/forms/employee-form";
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
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { UsersRound } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";

export default function StaffPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, forbidden, reload } =
    useEntityList<EmployeeRow>(
      "/staff/employees?include_inactive=true",
      entityId,
    );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <AppShell title="Staff">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} registered employee${total === 1 ? "" : "s"} (active and inactive — never deleted)`
            : "Select a restaurant in the sidebar"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {entityId && (
            <Link
              href="/balances/staff"
              className="text-sm text-primary hover:underline"
            >
              Staff balances →
            </Link>
          )}
          <Button type="button" disabled={!entityId} onClick={() => setFormOpen(true)}>
            New employee
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {entityId && forbidden && <ForbiddenMessage context="staff list" />}
      {loading && <TableSkeleton columns={3} />}

      {!loading && entityId && !forbidden && items.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title="No employees yet"
          hint="Add staff to track salary accruals, advances, and payments."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Pay currency</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
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
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <EmployeeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
