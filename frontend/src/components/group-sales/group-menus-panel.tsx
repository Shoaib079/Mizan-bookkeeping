"use client";

import { useState } from "react";

import { GroupMenuForm } from "@/components/forms/group-menu-form";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { UtensilsCrossed } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import type { GroupMenuRow } from "@/lib/group-sales-types";
import { useEntityList } from "@/lib/use-entity-list";

export function GroupMenusPanel() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload, offset, setOffset, pageSize } =
    useEntityList<GroupMenuRow>(
      "/group-menus?include_inactive=true",
      entityId,
    );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GroupMenuRow | null>(null);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <ListPage
      title="Group menus"
      meta="Catalog of menus tour agencies can book. Used when recording group sales."
      loading={loading}
      error={error}
      primaryAction={
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New menu
        </Button>
      }
      countLabel={`${total} menu${total === 1 ? "" : "s"}`}
      skeletonColumns={3}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={UtensilsCrossed}
          title="No group menus yet"
          hint="Add menus your tour agencies can book (e.g. Veg lunch, Non-veg dinner)."
        />
      }
      table={
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right"> </DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>{row.name}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </DataTableCell>
                <DataTableCell align="right">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
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
      <GroupMenuForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        menu={editing}
        onSaved={() => void reload()}
      />
    </ListPage>
  );

}
