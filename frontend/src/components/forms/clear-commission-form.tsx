"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
  onCleared?: () => void;
};

export function ClearCommissionForm({ open, onClose, onCleared }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [description, setDescription] = useState("Clear bank commission");
  const [error, setError] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmWarning(null);
  }, [open]);

  async function submitClear(confirm: boolean) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/pos/clearing-reconciliation/clear-commission`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            description: description.trim() || null,
            confirm,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setConfirmWarning(null);
      onCleared?.();
      toast("Bank commission cleared");
      onClose();
    } catch (err) {
      // 409 = large-amount guard: surface it as a confirmation, not a hard error.
      if (err instanceof ApiError && err.status === 409) {
        submitIdempotency.resetSubmit();
        setConfirmWarning(err.message);
      } else {
        setConfirmWarning(null);
        setError(err instanceof Error ? err.message : "Clear failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitClear(false);
  }

  return (
    <Dialog open={open} title="Clear bank commission" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Posts accumulated bank commission from clearing to expense when all
          card sales are settled and in-transit is zero.
        </p>
        <div>
          <Label htmlFor="clear-desc">Description (optional)</Label>
          <Input
            id="clear-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {confirmWarning ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{confirmWarning}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setConfirmWarning(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submitClear(true)}
              >
                {submitting ? "Clearing…" : "Proceed anyway"}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Clearing…" : "Clear bank commission"}
          </Button>
        )}
      </form>
    </Dialog>
  );
}
