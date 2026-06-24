"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";

export type CustomerRow = {
  id: string;
  name: string;
  identifier: string | null;
  is_active: boolean;
  notes: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  customer?: CustomerRow | null;
  onSaved?: () => void;
};

export function CustomerForm({ open, onClose, customer, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const editing = Boolean(customer);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setIdentifier(customer?.identifier ?? "");
    setNotes(customer?.notes ?? "");
    setIsActive(customer?.is_active ?? true);
    setError(null);
  }, [open, customer]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing && customer) {
        await apiFetch(`/entities/${entityId}/customers/${customer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            identifier: identifier || null,
            notes: notes || null,
            is_active: isActive,
          }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            identifier: identifier || null,
            notes: notes || null,
          }),
        });
      }
      onSaved?.();
      onClose();
      toast(editing ? "Customer updated" : "Customer added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit customer" : "New customer"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cust-name">Name</Label>
          <Input
            id="cust-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cust-id">Identifier (optional)</Label>
          <Input
            id="cust-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Phone, room #, …"
          />
        </div>
        <div>
          <Label htmlFor="cust-notes">Notes (optional)</Label>
          <Input
            id="cust-notes"
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
          {submitting ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </Button>
      </form>
    </Dialog>
  );
}
