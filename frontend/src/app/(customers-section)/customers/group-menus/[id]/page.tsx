"use client";

/** One menu — its price and its dishes (MENU_PLAN.md slice 2).
 *
 * The screen the Word document becomes. Dishes are references, so the order
 * and the "or similar" note live here, while the name and description live on
 * the dish and are corrected once for every menu that serves it.
 */

import { ArrowDown, ArrowUp, UtensilsCrossed } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AddDishToMenuDialog } from "@/components/forms/add-dish-to-menu-dialog";
import { GroupMenuForm } from "@/components/forms/group-menu-form";
import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure } from "@/components/page/summary-panel";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import {
  MENU_CATEGORIES,
  type GroupMenuLineRow,
  type GroupMenuRow,
} from "@/lib/group-sales-types";
import { useToast } from "@/lib/toast";

/** "$15.00 +KDV", with the surcharge where there is one. */
function priceLabel(menu: GroupMenuRow): string {
  if (menu.price_minor === null) return "Not priced";
  const base = formatFxNative(menu.price_minor, menu.currency);
  const surcharge =
    menu.surcharge_minor !== null
      ? ` + ${formatFxNative(menu.surcharge_minor, menu.currency)}`
      : "";
  return `${base}${surcharge}`;
}

export default function GroupMenuDetailPage() {
  const params = useParams<{ id: string }>();
  const menuId = params.id;
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [menu, setMenu] = useState<GroupMenuRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId || !menuId) return;
    setLoading(true);
    setError(null);
    try {
      setMenu(
        await apiFetch<GroupMenuRow>(
          `/entities/${entityId}/group-menus/${menuId}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, menuId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Send the whole list, in the order shown.
   *
   * Wholesale rather than a patch per row: reordering is the common edit, and
   * a sequence of moves has more ways to end up half-applied.
   */
  const saveLines = useCallback(
    async (lines: GroupMenuLineRow[]) => {
      if (!entityId) return;
      try {
        setMenu(
          await apiFetch<GroupMenuRow>(
            `/entities/${entityId}/group-menus/${menuId}/lines`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                lines.map((line) => ({
                  dish_id: line.dish_id,
                  note: line.note,
                })),
              ),
            },
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the menu");
      }
    },
    [entityId, menuId],
  );

  const move = (index: number, by: number) => {
    if (!menu) return;
    const next = [...menu.lines];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void saveLines(next);
  };

  const remove = (line: GroupMenuLineRow) => {
    if (!menu) return;
    void saveLines(menu.lines.filter((l) => l.id !== line.id));
    toast(`${line.dish_name} removed from this menu`);
  };

  const categoryLabel = menu?.category
    ? MENU_CATEGORIES.find((c) => c.value === menu.category)?.label
    : null;

  return (
    <EntityDetailPage
      title={menu?.name ?? "Menu"}
      titleAction={
        menu ? <EditTitleButton onClick={() => setEditOpen(true)} /> : undefined
      }
      loading={loading}
      error={error}
      meta={
        menu && (
          <MetaFacts
            items={[
              <StatusBadge
                key="status"
                status={menu.is_active ? "active" : "inactive"}
              />,
              categoryLabel,
              `${menu.lines.length} dish${menu.lines.length === 1 ? "" : "es"}`,
              menu.description,
            ].filter(Boolean)}
          />
        )
      }
      primaryAction={
        <Button type="button" onClick={() => setAddOpen(true)}>
          Add dish
        </Button>
      }
      headline={
        menu && (
          <HeadlineFigure
            label="Price per person"
            amountKurus={menu.price_minor ?? 0}
            format={() => priceLabel(menu)}
            caption={
              [
                menu.price_excludes_vat ? "+KDV" : "VAT included",
                menu.surcharge_label,
              ]
                .filter(Boolean)
                .join(" · ")
            }
          />
        )
      }
      activity={
        menu && (
          <DetailSection title="Dishes">
            {menu.lines.length === 0 ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="No dishes on this menu yet"
                hint="Add the dishes it serves. Rice, naan and dessert usually go last."
              />
            ) : (
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableHeaderCell>Dish</DataTableHeaderCell>
                    <DataTableHeaderCell>Note</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Order</DataTableHeaderCell>
                    <DataTableHeaderCell align="right"> </DataTableHeaderCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {menu.lines.map((line, index) => (
                    <DataTableRow key={line.id}>
                      <DataTableCell>
                        <span className="font-medium text-foreground">
                          {line.dish_name}
                        </span>
                        {line.dish_description && (
                          <span className="block text-xs text-muted-foreground">
                            {line.dish_description}
                          </span>
                        )}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {line.note ?? "—"}
                      </DataTableCell>
                      <DataTableCell align="right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Move ${line.dish_name} up`}
                            className="h-8 px-2"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Move ${line.dish_name} down`}
                            className="h-8 px-2"
                            disabled={index === menu.lines.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </div>
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => remove(line)}
                        >
                          Remove
                        </Button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </DetailSection>
        )
      }
    >
      <GroupMenuForm
        open={editOpen}
        menu={menu}
        onClose={() => setEditOpen(false)}
        onSaved={() => void reload()}
      />
      <AddDishToMenuDialog
        open={addOpen}
        alreadyOn={menu?.lines ?? []}
        onClose={() => setAddOpen(false)}
        onAdd={(dishId, note) => {
          if (!menu) return;
          void saveLines([
            ...menu.lines,
            {
              id: `new-${dishId}`,
              dish_id: dishId,
              dish_name: "",
              dish_description: null,
              dish_description_tr: null,
              sort_order: menu.lines.length,
              note,
            },
          ]);
        }}
      />
    </EntityDetailPage>
  );
}
