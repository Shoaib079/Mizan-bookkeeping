"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";
import { normalizeVknInput, optionalTaxIdValidationMessage } from "@/lib/vkn";

export type CustomerRow = {
  id: string;
  name: string;
  identifier: string | null;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
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
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const editing = Boolean(customer);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setTaxId(customer?.tax_id ?? "");
    setContactName(customer?.contact_name ?? "");
    setPhone(customer?.phone ?? "");
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
    const taxError = optionalTaxIdValidationMessage(taxId);
    if (taxError) {
      setError(taxError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const tax_id = normalizeVknInput(taxId) || null;
    try {
      if (editing && customer) {
        const idempotencyKey = submitIdempotency.beginSubmit();
        await apiFetch(`/entities/${entityId}/customers/${customer.id}`, {
          method: "PATCH",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            tax_id,
            contact_name: contactName.trim() || null,
            phone: phone.trim() || null,
            identifier: identifier || null,
            notes: notes || null,
            is_active: isActive,
          }),
        });
        submitIdempotency.completeSubmit();
      } else {
        const idempotencyKey = submitIdempotency.beginSubmit();
        await apiFetch(`/entities/${entityId}/customers`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            tax_id,
            contact_name: contactName.trim() || null,
            phone: phone.trim() || null,
            identifier: identifier || null,
            notes: notes || null,
          }),
        });
        submitIdempotency.completeSubmit();
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
          <Label htmlFor="cust-name">Company / agency name</Label>
          <Input
            id="cust-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cust-tax">VKN or TCKN (optional)</Label>
          <Input
            id="cust-tax"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="10 or 11 digits"
          />
        </div>
        <div>
          <Label htmlFor="cust-contact">Contact person (optional)</Label>
          <Input
            id="cust-contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cust-phone">Phone (optional)</Label>
          <Input
            id="cust-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+90 …"
          />
        </div>
        <div>
          <Label htmlFor="cust-id">Other reference (optional)</Label>
          <Input
            id="cust-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Contract #, room block, …"
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
        {editing && (
          <p className="text-xs text-muted-foreground">
            Inactive customers stay in the ledger and financial reports; records
            are never deleted.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </Button>
      </form>
    </Dialog>
  );
}
