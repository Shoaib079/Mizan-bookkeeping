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
import { ListPage } from "@/components/page/list-page";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { Truck } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

export function DeliveryPlatformsPanel() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload, offset, setOffset, pageSize } =
    useEntityList<DeliveryPlatform>(
      "/delivery/platforms?include_inactive=true",
      entityId,
    );
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

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <ListPage
      title="Delivery platforms"
      loading={loading}
      error={error}
      primaryAction={
        <Button type="button" onClick={openCreate}>
          New platform
        </Button>
      }
      countLabel={`${total} platform${total === 1 ? "" : "s"}`}
      skeletonColumns={4}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={Truck}
          title="No delivery platforms yet"
          hint="Add Getir, Yemeksepeti, or other delivery partners."
        />
      }
      mobile={
        // Name, then the clearing account beneath it. Tapping the card is
        // Edit — on a phone the row is the target, so a button beside it
        // would be a second, smaller one for the same job.
        <MobileCardList>
          {items.map((row) => (
            <MobileCardRow
              key={row.id}
              onClick={() => openEdit(row)}
              title={row.name}
              meta={
                <>
                  <span>{row.gl_account_code}</span>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </>
              }
            />
          ))}
        </MobileCardList>
      }
      table={
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
      }
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
      <DeliveryPlatformForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        platform={editing}
        onSaved={() => void reload()}
      />
    </ListPage>
  );

}
