"use client";

/** Suppliers list — Phase 9 Slice 3. */

import Link from "next/link";
import { useState } from "react";

import { SupplierForm, type SupplierRow } from "@/components/forms/supplier-form";
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
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";

export default function SuppliersPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<SupplierRow>(
    "/suppliers",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <AppShell title="Suppliers">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} supplier${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          New supplier
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading suppliers…</p>
      )}

      {!loading && entityId && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No suppliers yet. Create one to track payables and e-Fatura invoices.
        </p>
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
        <Link href="/payables" className="text-primary hover:underline">
          Payables
        </Link>
        .
      </p>

      <SupplierForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
