"use client";

/** Seed this restaurant's dish list from another (MENU_PLAN.md §9).
 *
 * Menus are per restaurant because the locations are separate companies with
 * separate VKNs. That is the right call and it has one cost: a new restaurant
 * starts empty. This is the one-click answer — a copy, so the two lists
 * diverge from the moment it runs and neither can alter the other.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onCopied?: () => void;
};

export function CopyDishesDialog({ open, onClose, onCopied }: Props) {
  const { entityId, entities } = useEntity();
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState("");
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = entities.filter((entity) => entity.id !== entityId);

  useEffect(() => {
    if (!open) return;
    setSourceId(others[0]?.id ?? "");
    setError(null);
    // `others` is derived from props each render; depending on it would reset
    // the choice on every keystroke elsewhere in the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId]);

  async function copy() {
    if (!entityId || !sourceId) return;
    setCopying(true);
    setError(null);
    try {
      const result = await apiFetch<{ copied: number; skipped: string[] }>(
        `/entities/${entityId}/dishes/copy-from`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_entity_id: sourceId }),
        },
      );
      onCopied?.();
      onClose();
      if (result.copied === 0 && result.skipped.length > 0) {
        toast("Every dish was already here — nothing copied", "warning");
      } else if (result.skipped.length > 0) {
        // Named rather than counted: you want to know *which* were left, since
        // those are the ones already worded differently here.
        toast(
          `Copied ${result.copied}. Left alone: ${result.skipped.join(", ")}`,
          "warning",
        );
      } else {
        toast(`Copied ${result.copied} dishes`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Dialog open={open} title="Copy dishes" onClose={onClose}>
      <div className="space-y-3">
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There is only one restaurant to copy from — this one. Add another
            restaurant first.
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="copy-src">Copy from</Label>
              <Select
                id="copy-src"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {others.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Copies the active dishes, with their descriptions. Anything
              already here keeps its own wording and is left alone. The two
              lists are independent afterwards — editing one does not touch the
              other.
            </p>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={copying || !sourceId}
            onClick={() => void copy()}
          >
            {copying ? "Copying…" : "Copy dishes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
