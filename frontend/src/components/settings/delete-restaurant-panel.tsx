"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { isOwner } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";
import { newIdempotencyKey } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

/** Permanently delete the restaurant you are currently in.
 *
 * Three things about the shape of this, none of them cosmetic.
 *
 * It only ever offers the *current* restaurant, and names it on the button
 * rather than saying "this restaurant". Two restaurants sit next to each other
 * in the switcher, one of them holds real books, and the failure this has to
 * survive is not a mis-click — it is being certain you are in one when you are
 * in the other. A generic label reads the same in both, so it cannot help.
 * The backend applies the same rule: the id in the path is the only thing it
 * will delete, and it will not take an id you are not the owner of.
 *
 * It renders nothing at all for non-owners. Not disabled — absent. There is no
 * grant that turns this on; owner is the whole gate.
 *
 * And there is no undo, no backup taken first, and nothing typed to confirm —
 * that was the owner's call, made knowing it. What is left standing between a
 * mistake and the books is this dialog, which is why it says plainly what goes
 * and does not soften it.
 */
export function DeleteRestaurantPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useEntityAccess();
  const { entityId, entities, visibleEntities, setEntityId, refreshEntities } =
    useEntity();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = entities.find((entity) => entity.id === entityId);

  // `current` can be missing for a moment while the list loads. Rendering the
  // button before then would put "Delete undefined" on screen.
  if (!isOwner(role) || !entityId || !current) return null;

  async function onDelete() {
    if (!current) return;
    setDeleting(true);
    setError(null);
    try {
      // A key, like every other mutation — production rejects those without
      // one. It earns its keep here: a double-press replays the first
      // response instead of issuing a second delete against an id that no
      // longer exists and coming back 404 on a delete that worked.
      await apiFetch(`/entities/${entityId}`, {
        method: "DELETE",
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
      return;
    }

    const deletedName = current.name;
    // Move off the deleted restaurant before anything re-reads it. The
    // remaining list is computed from what we had, because refreshEntities
    // has not returned yet and every page below is still scoped to an id
    // that no longer resolves.
    const next = visibleEntities.find((entity) => entity.id !== entityId);
    setEntityId(next?.id ?? "");
    await refreshEntities();

    setConfirming(false);
    setDeleting(false);
    toast(`${deletedName} deleted`);
    router.push(next ? "/" : "/onboarding");
  }

  return (
    <>
      <section className="rounded-xl border border-destructive/40 bg-card p-5">
        <h2 className="text-sm font-semibold text-destructive">
          Delete this restaurant
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently removes{" "}
          <span className="font-medium text-foreground">{current.name}</span>{" "}
          and everything recorded for it. Only this restaurant — your others are
          untouched.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Only an owner can do this.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Delete {current.name}
        </Button>
      </section>

      <Dialog
        open={confirming}
        title={`Delete ${current.name}?`}
        onClose={() => setConfirming(false)}
        size="compact"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Everything for this restaurant will be gone forever — the ledger,
            invoices, receipts, bank statements, suppliers, customers, staff,
            partners and every report.
          </p>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
