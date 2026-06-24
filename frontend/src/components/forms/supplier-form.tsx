"use client";

/** Supplier master create/edit — Phase 9 Slice 3. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

export type SupplierRow = {
  id: string;
  name: string;
  vkn: string;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  supplier?: SupplierRow | null;
  onSaved?: () => void;
};

export function SupplierForm({ open, onClose, supplier, onSaved }: Props) {
  const { entityId } = useEntity();
  const editing = Boolean(supplier);
  const [name, setName] = useState("");
  const [vkn, setVkn] = useState("");
  const [iban, setIban] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setVkn(supplier?.vkn ?? "");
    setIban(supplier?.iban ?? "");
    setNotes(supplier?.notes ?? "");
    setIsActive(supplier?.is_active ?? true);
    setError(null);
  }, [open, supplier]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing && supplier) {
        await apiFetch(`/entities/${entityId}/suppliers/${supplier.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            iban: iban || null,
            notes: notes || null,
            is_active: isActive,
          }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/suppliers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            vkn,
            iban: iban || null,
            notes: notes || null,
          }),
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
      title={editing ? "Edit supplier" : "New supplier"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="sup-name">Name</Label>
          <Input
            id="sup-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="sup-vkn">VKN (10–11 digits)</Label>
          <Input
            id="sup-vkn"
            value={vkn}
            onChange={(e) => setVkn(e.target.value)}
            required
            disabled={editing}
            placeholder="1234567890"
          />
        </div>
        <div>
          <Label htmlFor="sup-iban">IBAN (optional)</Label>
          <Input
            id="sup-iban"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="TR…"
          />
        </div>
        <div>
          <Label htmlFor="sup-notes">Notes (optional)</Label>
          <Input
            id="sup-notes"
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
          {submitting ? "Saving…" : editing ? "Save changes" : "Create supplier"}
        </Button>
      </form>
    </Dialog>
  );
}
