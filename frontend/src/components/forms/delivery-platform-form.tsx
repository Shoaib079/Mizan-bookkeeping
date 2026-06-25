"use client";

/** Delivery platform create/edit — Phase 9 Slice 5. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
  platform?: DeliveryPlatform | null;
  onSaved?: () => void;
};

export function DeliveryPlatformForm({ open, onClose, platform, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const editing = Boolean(platform);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(platform?.name ?? "");
    setIsActive(platform?.is_active ?? true);
    setError(null);
  }, [open, platform]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing && platform) {
        await apiFetch(`/entities/${entityId}/delivery/platforms/${platform.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, is_active: isActive }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/delivery/platforms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      onSaved?.();
      toast(editing ? "Platform updated" : "Platform added");
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
      title={editing ? "Edit delivery platform" : "New delivery platform"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="platform-name">Platform name</Label>
          <Input
            id="platform-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Getir, Yemeksepeti…"
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create platform"}
        </Button>
      </form>
    </Dialog>
  );
}
