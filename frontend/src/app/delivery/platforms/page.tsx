"use client";

import { useState } from "react";

import { DeliveryPlatformForm } from "@/components/forms/delivery-platform-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Truck } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

export default function DeliveryPlatformsPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } =
    useEntityList<DeliveryPlatform>("/delivery/platforms?include_inactive=true", entityId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryPlatform | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(platform: DeliveryPlatform) {
    setEditing(platform);
    setFormOpen(true);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} platform${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button type="button" disabled={!entityId} onClick={openCreate}>
          New platform
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No delivery platforms yet"
          hint="Add Getir, Yemeksepeti, or other delivery partners."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Clearing GL</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right"> </DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>{row.name}</DataTableCell>
                <DataTableCell>{row.gl_account_code}</DataTableCell>
                <DataTableCell>
                  <StatusBadge
                    status={row.is_active ? "active" : "inactive"}
                  />
                </DataTableCell>
                <DataTableCell align="right">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <DeliveryPlatformForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        platform={editing}
        onSaved={() => void reload()}
      />
    </>
  );
}
