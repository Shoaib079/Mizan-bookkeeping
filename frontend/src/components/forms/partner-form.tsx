"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

export type PartnerRow = {
  id: string;
  name: string;
  is_active: boolean;
  notes: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  partner?: PartnerRow | null;
  onSaved?: () => void;
};

export function PartnerForm({ open, onClose, partner, onSaved }: Props) {
  const { entityId } = useEntity();
  const editing = Boolean(partner);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(partner?.name ?? "");
    setNotes(partner?.notes ?? "");
    setIsActive(partner?.is_active ?? true);
    setError(null);
  }, [open, partner]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing && partner) {
        await apiFetch(`/entities/${entityId}/partners/${partner.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            notes: notes || null,
            is_active: isActive,
          }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/partners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, notes: notes || null }),
        });
      }
      onSaved?.();
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
      title={editing ? "Edit partner" : "New partner"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="part-name">Name</Label>
          <Input
            id="part-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="part-notes">Notes (optional)</Label>
          <Input
            id="part-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create partner"}
        </Button>
      </form>
    </Dialog>
  );
}
