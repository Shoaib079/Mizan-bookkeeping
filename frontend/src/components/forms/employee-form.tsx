"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";

export type EmployeeRow = {
  id: string;
  name: string;
  pay_currency: string;
  is_active: boolean;
  notes: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  employee?: EmployeeRow | null;
  onSaved?: () => void;
};

export function EmployeeForm({ open, onClose, employee, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const editing = Boolean(employee);
  const [name, setName] = useState("");
  const [payCurrency, setPayCurrency] = useState("TRY");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? "");
    setPayCurrency(employee?.pay_currency ?? "TRY");
    setNotes(employee?.notes ?? "");
    setIsActive(employee?.is_active ?? true);
    setError(null);
  }, [open, employee]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing && employee) {
        await apiFetch(
          `/entities/${entityId}/staff/employees/${employee.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              notes: notes || null,
              is_active: isActive,
            }),
          },
        );
      } else {
        await apiFetch(`/entities/${entityId}/staff/employees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            pay_currency: payCurrency,
            notes: notes || null,
          }),
        });
      }
      onSaved?.();
      onClose();
      toast(editing ? "Employee updated" : "Employee added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit employee" : "New employee"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="emp-name">Name</Label>
          <Input
            id="emp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {!editing && (
          <div>
            <Label htmlFor="emp-currency">Pay currency</Label>
            <Select
              id="emp-currency"
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="emp-notes">Notes (optional)</Label>
          <Input
            id="emp-notes"
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
          {submitting ? "Saving…" : editing ? "Save changes" : "Create employee"}
        </Button>
      </form>
    </Dialog>
  );
}
