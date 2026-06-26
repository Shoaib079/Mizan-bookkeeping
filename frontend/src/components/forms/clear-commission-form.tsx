"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
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
  const [description, setDescription] = useState("Clear card commission");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onCleared?.();
      toast("Commission cleared");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Clear card commission" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Posts accumulated card commission from clearing to expense when all
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Clearing…" : "Clear commission"}
        </Button>
      </form>
    </Dialog>
  );
}
