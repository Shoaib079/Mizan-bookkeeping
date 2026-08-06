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
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { UtensilsCrossed } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { MENU_CATEGORIES, type GroupMenuRow } from "@/lib/group-sales-types";
import { formatFxNative } from "@/lib/fx-money";
import Link from "next/link";
import { useEntityList } from "@/lib/use-entity-list";

/** "$15.00 +KDV", or "$27.00 + $2.00" for the catering menus. */
function priceLabel(menu: GroupMenuRow): string {
  if (menu.price_minor === null) return "—";
  const base = formatFxNative(menu.price_minor, menu.currency);
  const extra =
    menu.surcharge_minor !== null
      ? ` + ${formatFxNative(menu.surcharge_minor, menu.currency)}`
      : "";
  const vat = menu.price_excludes_vat ? " +KDV" : "";
  return `${base}${extra}${vat}`;
}

function categoryLabel(menu: GroupMenuRow): string {
  return MENU_CATEGORIES.find((c) => c.value === menu.category)?.label ?? "—";
}

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
      skeletonColumns={5}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={UtensilsCrossed}
          title="No group menus yet"
          hint="Add menus your tour agencies can book (e.g. Veg lunch, Non-veg dinner)."
        />
      }
      mobile={
        <MobileCardList>
          {items.map((row) => (
            <MobileCardRow
              key={row.id}
              href={`/customers/group-menus/${row.id}`}
              title={row.name}
              amount={priceLabel(row)}
              meta={
                <>
                  <span>{categoryLabel(row)}</span>
                  <span>
                    {row.line_count} dish{row.line_count === 1 ? "" : "es"}
                  </span>
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
              <DataTableHeaderCell>Menu</DataTableHeaderCell>
              <DataTableHeaderCell>Category</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Dishes</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Price</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id} href={`/customers/group-menus/${row.id}`}>
                <DataTableCell>
                  <Link
                    href={`/customers/group-menus/${row.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{categoryLabel(row)}</DataTableCell>
                <DataTableCell align="right">{row.line_count}</DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                  {priceLabel(row)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
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
