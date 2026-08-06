"use client";

/** Add or edit a dish (MENU_PLAN.md slice 1).
 *
 * A dish is written once and referenced by however many menus serve it, so
 * this form is the single place a name or description is corrected — the whole
 * reason the menu stopped being a Word file.
 */

import { Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type DishRow = {
  id: string;
  name: string;
  description: string | null;
  description_tr: string | null;
  suits_veg: boolean;
  suits_non_veg: boolean;
  suits_jain: boolean;
  is_active: boolean;
};

/** The menu kinds a dish can go on, in the order they appear in the document.
 *
 * Independent rather than a single classification: Dal Tadka belongs on the
 * vegetarian, non-vegetarian *and* Jain menus, and one value could not say so.
 */
export const SUITABILITY = [
  { key: "suits_veg", label: "Veg menus" },
  { key: "suits_non_veg", label: "Non-veg menus" },
  { key: "suits_jain", label: "Jain menus" },
] as const;

export type SuitabilityKey = (typeof SUITABILITY)[number]["key"];

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
  const [descriptionTr, setDescriptionTr] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [suits, setSuits] = useState<Record<SuitabilityKey, boolean>>({
    suits_veg: true,
    suits_non_veg: true,
    suits_jain: true,
  });
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Allowed, but worth saying out loud: a dish ticked for nothing never
  // appears when building a menu, which looks like the dish went missing.
  const noMenus = SUITABILITY.every((option) => !suits[option.key]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open) return;
    setName(dish?.name ?? "");
    setDescription(dish?.description ?? "");
    setDescriptionTr(dish?.description_tr ?? "");
    setSuits({
      suits_veg: dish?.suits_veg ?? true,
      suits_non_veg: dish?.suits_non_veg ?? true,
      suits_jain: dish?.suits_jain ?? true,
    });
    setIsActive(dish?.is_active ?? true);
    setError(null);
  }, [open, dish]);

  /** Fill both description boxes from the dish name.
   *
   * Fills the form; it does not save. What comes back is a starting point
   * from something that has never eaten here — the "or similar" scattered
   * through these menus exists because the dish varies by day.
   */
  async function draftDescription() {
    if (!entityId || !name.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const draft = await apiFetch<{
        description: string;
        description_tr: string;
      }>(`/entities/${entityId}/dishes/suggest-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      // Only fill what is empty: a description already written by hand is not
      // improved by being overwritten.
      if (draft.description && !description.trim()) {
        setDescription(draft.description);
      }
      if (draft.description_tr && !descriptionTr.trim()) {
        setDescriptionTr(draft.description_tr);
      }
      toast("Draft written — check it before saving", "warning");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write a draft");
    } finally {
      setDrafting(false);
    }
  }

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
      description_tr: descriptionTr.trim() || null,
      ...suits,
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
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <Label htmlFor="dish-desc" className="mb-0">
              Description (optional)
            </Label>
            <Button
              type="button"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={!name.trim() || drafting}
              onClick={() => void draftDescription()}
            >
              <Sparkles className="size-3.5" />
              {drafting ? "Writing…" : "Draft for me"}
            </Button>
          </div>
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
          <Label htmlFor="dish-desc-tr">Turkish description (optional)</Label>
          <Input
            id="dish-desc-tr"
            value={descriptionTr}
            onChange={(e) => setDescriptionTr(e.target.value)}
            placeholder="Kimyon ve sarımsakla kavrulmuş sarı mercimek"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            For Turkish-speaking agencies. The dish name stays as it is.
          </p>
        </div>
        <fieldset>
          <legend className="mb-1 block text-xs text-muted-foreground">
            Can go on
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SUITABILITY.map((option) => (
              <label
                key={option.key}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={suits[option.key]}
                  onChange={(e) =>
                    setSuits((prev) => ({
                      ...prev,
                      [option.key]: e.target.checked,
                    }))
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {noMenus
              ? "With none ticked this dish will not be offered on any menu."
              : "All three by default. Untick where it does not belong — meat off the veg and Jain menus."}
          </p>
        </fieldset>
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
