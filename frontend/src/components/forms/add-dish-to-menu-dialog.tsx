"use client";

/** Put a dish on a menu (MENU_PLAN.md slice 2).
 *
 * Dishes already on the menu are hidden rather than shown greyed out: adding
 * the same dish twice is the error that put White Rice on the Jain menu twice
 * for three years, and the simplest way to prevent it is to not offer it.
 */

import { useEffect, useMemo, useState } from "react";

import { type DishRow } from "@/components/forms/dish-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useEntity } from "@/lib/entity-context";
import type { GroupMenuLineRow } from "@/lib/group-sales-types";
import { useEntityList } from "@/lib/use-entity-list";

type Props = {
  open: boolean;
  alreadyOn: GroupMenuLineRow[];
  onClose: () => void;
  onAdd: (dishId: string, note: string | null) => void;
};

export function AddDishToMenuDialog({ open, alreadyOn, onClose, onAdd }: Props) {
  const { entityId } = useEntity();
  const { items } = useEntityList<DishRow>("/dishes", entityId);
  const [dishId, setDishId] = useState("");
  const [note, setNote] = useState("");

  const onMenu = useMemo(
    () => new Set(alreadyOn.map((line) => line.dish_id)),
    [alreadyOn],
  );
  const available = items.filter((dish) => !onMenu.has(dish.id));

  useEffect(() => {
    if (!open) return;
    setDishId(available[0]?.id ?? "");
    setNote("");
    // Deliberately not depending on `available`: it is rebuilt every render,
    // and depending on it would reset the choice while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} title="Add a dish" onClose={onClose}>
      <div className="space-y-3">
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "No dishes yet. Add them under Dishes first."
              : "Every dish is already on this menu."}
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="add-dish">Dish</Label>
              <Select
                id="add-dish"
                value={dishId}
                onChange={(e) => setDishId(e.target.value)}
              >
                {available.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="add-note">Note (optional)</Label>
              <Input
                id="add-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="or similar"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Printed after the dish name. Use it for “or similar” or “1 litre
                for 4 pax” — it belongs to this menu, not to the dish.
              </p>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dishId}
            onClick={() => {
              onAdd(dishId, note.trim() || null);
              onClose();
            }}
          >
            Add to menu
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
