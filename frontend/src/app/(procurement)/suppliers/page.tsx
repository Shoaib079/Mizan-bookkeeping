"use client";

/** Suppliers list — Phase 9 Slice 3. */

import Link from "next/link";
import { useState } from "react";

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

export default function SuppliersPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, forbidden, reload } =
    useEntityList<SupplierRow>("/suppliers?include_inactive=true", entityId);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} registered supplier${total === 1 ? "" : "s"} (active and inactive)`
            : "Select a restaurant in the sidebar"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
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

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>VKN</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
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
                  <StatusBadge
                    status={row.is_active ? "active" : "inactive"}
                  />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

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
