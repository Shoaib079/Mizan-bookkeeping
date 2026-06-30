"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";

export type PartnerRow = {
  id: string;
  name: string;
  is_active: boolean;
  ownership_share_pct: string | null;
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
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const editing = Boolean(partner);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(partner?.name ?? "");
    setNotes(partner?.notes ?? "");
    setSharePct(
      partner?.ownership_share_pct != null
        ? String(partner.ownership_share_pct)
        : "",
    );
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
    const shareTrimmed = sharePct.trim();
    let ownership_share_pct: string | null = null;
    if (shareTrimmed) {
      const parsed = Number.parseFloat(shareTrimmed.replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        setError("Share % must be a number from 0 to 100.");
        setSubmitting(false);
        return;
      }
      ownership_share_pct = shareTrimmed.replace(",", ".");
    }
    try {
      if (editing && partner) {
        const idempotencyKey = submitIdempotency.beginSubmit();
        await apiFetch(`/entities/${entityId}/partners/${partner.id}`, {
          method: "PATCH",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            notes: notes || null,
            is_active: isActive,
            ownership_share_pct,
          }),
        });
        submitIdempotency.completeSubmit();
      } else {
        const idempotencyKey = submitIdempotency.beginSubmit();
        await apiFetch(`/entities/${entityId}/partners`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            notes: notes || null,
            ownership_share_pct,
          }),
        });
        submitIdempotency.completeSubmit();
      }
      onSaved?.();
      onClose();
      toast(editing ? "Partner updated" : "Partner added");
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
        <div>
          <Label htmlFor="part-share">Ownership share % (optional)</Label>
          <Input
            id="part-share"
            inputMode="decimal"
            value={sharePct}
            onChange={(e) => setSharePct(e.target.value)}
            placeholder="e.g. 50"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Informational only — not used in the ledger. Active partners should
            total 100%.
          </p>
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
        {editing && (
          <p className="text-xs text-muted-foreground">
            Inactive partners stay in the ledger and financial reports; records
            are never deleted.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create partner"}
        </Button>
      </form>
    </Dialog>
  );
}
