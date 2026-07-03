"use client";

/** Suppliers list — Phase 9 Slice 3. */

import Link from "next/link";
import { useMemo, useState } from "react";

import { SupplierForm, type SupplierRow } from "@/components/forms/supplier-form";
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
import { Users } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";

function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell>VKN</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell>
              <Link
                href={`/suppliers/${row.id}`}
                className="text-primary hover:underline"
              >
                {row.name}
              </Link>
            </DataTableCell>
            <DataTableCell>{row.vkn}</DataTableCell>
            <DataTableCell>
              <StatusBadge status={row.is_active ? "active" : "inactive"} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export default function SuppliersPage() {
  const { entityId } = useEntity();
  const [showInactive, setShowInactive] = useState(false);
  const listPath = showInactive
    ? "/suppliers?include_inactive=true"
    : "/suppliers?include_inactive=false";
  const { items, total, loading, error, forbidden, reload } =
    useEntityList<SupplierRow>(listPath, entityId);
  const [formOpen, setFormOpen] = useState(false);

  const activeItems = useMemo(
    () => items.filter((row) => row.is_active),
    [items],
  );
  const inactiveItems = useMemo(
    () => items.filter((row) => !row.is_active),
    [items],
  );

  const activeCount = showInactive ? activeItems.length : total;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? showInactive
              ? `${activeCount} active · ${inactiveItems.length} inactive`
              : `${total} active supplier${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive suppliers
            </label>
          )}
          {entityId && (
            <Link
              href="/balances/suppliers"
              className="text-sm text-primary hover:underline"
            >
              Payables →
            </Link>
          )}
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setFormOpen(true)}
          >
            New supplier
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {entityId && forbidden && (
        <ForbiddenMessage context="supplier list" />
      )}
      {loading && <TableSkeleton columns={3} />}

      {!loading && entityId && !forbidden && items.length === 0 && (
        <EmptyState
          icon={Users}
          title="No suppliers yet"
          hint="Create a supplier to track payables and e-Fatura invoices."
        />
      )}

      {!loading && !forbidden && showInactive && activeItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Active suppliers
          </h2>
          <SupplierTable rows={activeItems} />
        </section>
      )}

      {!loading && !forbidden && showInactive && inactiveItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Inactive suppliers
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Deactivated suppliers stay in history but are hidden from invoice
            linking and new payments.
          </p>
          <SupplierTable rows={inactiveItems} />
        </section>
      )}

      {!loading &&
        !forbidden &&
        !showInactive &&
        items.length > 0 && <SupplierTable rows={items} />}

      <p className="mt-4 text-xs text-muted-foreground">
        Outstanding balances across all suppliers are on{" "}
        <Link href="/balances/suppliers" className="text-primary hover:underline">
          Payables
        </Link>
        .
      </p>

      <SupplierForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </>
  );
}
