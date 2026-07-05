"use client";

/** Inline control to add an owner-defined expense category (5900–5999 band). */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import type { ChartAccount } from "@/lib/expense-accounts";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";

type Props = {
  entityId: string;
  onCreated: (account: ChartAccount) => void | Promise<void>;
  className?: string;
};

export function AddExpenseCategoryButton({
  entityId,
  onCreated,
  className,
}: Props) {
  const submitIdempotency = useSubmitIdempotency();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    setName("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const account = await apiFetch<ChartAccount>(
        `/entities/${entityId}/chart-of-accounts`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      submitIdempotency.completeSubmit();
      await onCreated(account);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          const detail = err.message.toLowerCase();
          if (detail.includes("limit")) {
            setError("Category limit reached — contact support if you need more.");
          } else {
            setError("A category with that name already exists.");
          }
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Could not add category");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={className ?? "text-sm"}
        disabled={!entityId}
        onClick={() => setOpen(true)}
      >
        + Add category
      </Button>
      <Dialog open={open} title="Add expense category" onClose={handleClose}>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            New categories appear in manual expense, bank statement, and cash
            movement pickers for this restaurant.
          </p>
          <div>
            <Label htmlFor="expense-category-name">Category name</Label>
            <Input
              id="expense-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Packaging supplies"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Adding…" : "Add category"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
