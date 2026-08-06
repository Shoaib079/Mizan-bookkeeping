"use client";

/** Add or edit a dish (MENU_PLAN.md slice 1).
 *
 * A dish is written once and referenced by however many menus serve it, so
 * this form is the single place a name or description is corrected — the whole
 * reason the menu stopped being a Word file.
 */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type DietaryKind = "veg" | "non_veg" | "jain";

export type DishRow = {
  id: string;
  name: string;
  description: string | null;
  dietary: DietaryKind | null;
  is_active: boolean;
};

export const DIETARY_LABELS: Record<DietaryKind, string> = {
  veg: "Vegetarian",
  non_veg: "Non-vegetarian",
  jain: "Jain",
};

type Props = {
  open: boolean;
  onClose: () => void;
  dish?: DishRow | null;
  onSaved?: () => void;
};

export function DishForm({ open, onClose, dish, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const editing = Boolean(dish);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dietary, setDietary] = useState<DietaryKind | "">("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open) return;
    setName(dish?.name ?? "");
    setDescription(dish?.description ?? "");
    setDietary(dish?.dietary ?? "");
    setIsActive(dish?.is_active ?? true);
    setError(null);
  }, [open, dish]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a dish name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    // null, not "": the API treats an empty string as absent anyway, and
    // sending null is what clears a description someone wants removed.
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      dietary: dietary || null,
      ...(editing ? { is_active: isActive } : {}),
    };
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        editing && dish
          ? `/entities/${entityId}/dishes/${dish.id}`
          : `/entities/${entityId}/dishes`,
        {
          method: editing ? "PATCH" : "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      onClose();
      toast(editing ? "Dish updated" : "Dish added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit dish" : "New dish"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="dish-name">Dish name</Label>
          <Input
            id="dish-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dal Tadka"
            required
          />
        </div>
        <div>
          <Label htmlFor="dish-desc">Description (optional)</Label>
          <Input
            id="dish-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Yellow lentils tempered with cumin and garlic"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Printed under the dish on the menu you send agencies. Leave blank to
            print the name alone.
          </p>
        </div>
        <div>
          <Label htmlFor="dish-diet">Suitable for (optional)</Label>
          <Select
            id="dish-diet"
            value={dietary}
            onChange={(e) => setDietary(e.target.value as DietaryKind | "")}
          >
            <option value="">Not specified</option>
            <option value="veg">{DIETARY_LABELS.veg}</option>
            <option value="non_veg">{DIETARY_LABELS.non_veg}</option>
            <option value="jain">{DIETARY_LABELS.jain}</option>
          </Select>
        </div>
        {editing && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
            <p className="text-xs text-muted-foreground">
              Retiring a dish hides it when building a menu. Menus that already
              list it keep reading correctly — nothing is deleted.
            </p>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create dish"}
        </Button>
      </form>
    </Dialog>
  );
}
