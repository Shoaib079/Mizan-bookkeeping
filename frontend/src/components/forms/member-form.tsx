"use client";

/** Add entity member — Phase 9 Slice 9; Phase 12 Slice 0c add-by-email. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { ENTITY_ROLES, type EntityRole } from "@/lib/settings-types";
import { useToast } from "@/lib/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function roleLabel(role: EntityRole): string {
  return ENTITY_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function MemberForm({ open, onClose, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<EntityRole>("cashier");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setDisplayName("");
    setRole("cashier");
    setError(null);
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant first.");
      return;
    }
    const trimmedEmail = email.trim();
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const body: { email: string; role: EntityRole; display_name?: string } = {
        email: trimmedEmail,
        role,
      };
      const trimmedName = displayName.trim();
      if (trimmedName) body.display_name = trimmedName;

      await apiFetch(`/entities/${entityId}/members`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      onClose();
      toast(`Added ${trimmedEmail} as ${roleLabel(role)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Already a member of this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to add member");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Add member" onClose={onClose}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="member-name">Display name</Label>
          <Input
            id="member-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional for new users"
          />
        </div>
        <div>
          <Label htmlFor="member-role">Role</Label>
          <Select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as EntityRole)}
          >
            {ENTITY_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add member"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
