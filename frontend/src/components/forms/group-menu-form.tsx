"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import type { GroupMenuRow } from "@/lib/group-sales-types";

type Props = {
  open: boolean;
  onClose: () => void;
  menu?: GroupMenuRow | null;
  onSaved?: () => void;
};

export function GroupMenuForm({ open, onClose, menu, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const editing = Boolean(menu);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(menu?.name ?? "");
    setIsActive(menu?.is_active ?? true);
    setError(null);
  }, [open, menu]);

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
      if (editing && menu) {
        await apiFetch(`/entities/${entityId}/group-menus/${menu.id}`, {
          method: "PATCH",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, is_active: isActive }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/group-menus`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast(editing ? "Menu updated" : "Menu added");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit group menu" : "New group menu"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="group-menu-name">Menu name</Label>
          <Input
            id="group-menu-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Veg lunch, Non-veg dinner…"
            required
          />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save" : "Add menu"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
