"use client";

/** Dishes — the reusable list menus are built from (MENU_PLAN.md slice 1).
 *
 * Sits beside Group menus because that is where menus already live. A dish is
 * written once here and referenced by however many menus serve it, so a
 * spelling is corrected in one place rather than in eleven Word tables.
 */

import { useMemo, useState } from "react";
import { UtensilsCrossed } from "lucide-react";

import {
  DishForm,
  SUITABILITY,
  type DishRow,
} from "@/components/forms/dish-form";
import { ListPage } from "@/components/page/list-page";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
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
import { Input } from "@/components/ui/input";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { useEntity } from "@/lib/entity-context";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useEntityList } from "@/lib/use-entity-list";

/** "Every menu", or the ones it is ticked for.
 *
 * Collapsed to a single phrase when all three are ticked, which is the common
 * case — rice, naan, salad, water and most vegetarian dishes. Spelling out
 * "Veg · Non-veg · Jain" on nearly every row would make the column noise. */
function menusLabel(dish: DishRow): string {
  const on = SUITABILITY.filter((option) => dish[option.key]);
  if (on.length === SUITABILITY.length) return "Every menu";
  if (on.length === 0) return "None";
  return on.map((option) => option.label.replace(" menus", "")).join(" · ");
}

export default function DishesPage() {
  const { entityId } = useEntity();
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim(), 300);
  const listPath = useMemo(() => {
    const params = new URLSearchParams({ include_inactive: "true" });
    if (search) params.set("q", search);
    return `/dishes?${params.toString()}`;
  }, [search]);

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
  } = useEntityList<DishRow>(listPath, entityId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DishRow | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (dish: DishRow) => {
    setEditing(dish);
    setFormOpen(true);
  };

  const DishTable = () => (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeaderCell>Dish</DataTableHeaderCell>
          <DataTableHeaderCell>Can go on</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {items.map((dish) => (
          <DataTableRow key={dish.id} onClick={() => openEdit(dish)}>
            <DataTableCell className="font-medium text-foreground">
              {dish.name}
            </DataTableCell>
            <DataTableCell>{menusLabel(dish)}</DataTableCell>
            <DataTableCell className="text-muted-foreground">
              {dish.description ?? "—"}
            </DataTableCell>
            <DataTableCell>
              <StatusBadge status={dish.is_active ? "active" : "inactive"} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );

  const DishCards = () => (
    <MobileCardList>
      {items.map((dish) => (
        <MobileCardRow
          key={dish.id}
          title={dish.name}
          onClick={() => openEdit(dish)}
          meta={
            <>
              <span>{menusLabel(dish)}</span>
              <StatusBadge status={dish.is_active ? "active" : "inactive"} />
              {dish.description && <span>{dish.description}</span>}
            </>
          }
        />
      ))}
    </MobileCardList>
  );

  return (
    <ListPage
      title="Dishes"
      loading={loading}
      error={error}
      forbidden={
        entityId && forbidden ? (
          <ForbiddenMessage context="dish list" />
        ) : undefined
      }
      primaryAction={
        <Button type="button" disabled={!entityId} onClick={openNew}>
          New dish
        </Button>
      }
      toolbar={
        <Input
          value={searchDraft}
          disabled={!entityId}
          placeholder="Search dishes…"
          className="w-56"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      }
      countLabel={
        entityId
          ? `${total} dish${total === 1 ? "" : "es"} (active and retired — never deleted)`
          : "Select a restaurant in the sidebar"
      }
      skeletonColumns={4}
      isEmpty={Boolean(entityId) && items.length === 0}
      empty={
        <EmptyState
          icon={UtensilsCrossed}
          title={search ? "No dishes match your search" : "No dishes yet"}
          hint={
            search
              ? "Try a different name or clear the search."
              : "Add the dishes your menus are built from — Dal Tadka, White Rice, Tandoori Naan."
          }
        />
      }
      table={<DishTable />}
      mobile={<DishCards />}
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
      <DishForm
        open={formOpen}
        dish={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </ListPage>
  );
}
