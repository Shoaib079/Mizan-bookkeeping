"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

type MoneyAccount = { id: string; name: string };

type ExpenseReceiptRead = {
  id: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ExpenseReceiptUploadForm({ open, onClose }: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccount[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    setCashAccounts(res.items);
    if (res.items[0]) setMoneyAccountId(res.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Set an entity ID in the sidebar first.");
      return;
    }
    if (!file) {
      setError("Choose a receipt photo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("money_account_id", moneyAccountId);
      body.append("actor_id", actorId);
      const intake = await apiFetch<ExpenseReceiptRead>(
        `/entities/${entityId}/expense-receipts`,
        { method: "POST", body },
      );
      onClose();
      setFile(null);
      router.push(`/review/receipts/${intake.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Expense receipt (photo)" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="receipt-file">Receipt photo</Label>
          <input
            id="receipt-file"
            type="file"
            accept="image/*,.txt"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <Label htmlFor="receipt-cash">Cash drawer</Label>
          <Select
            id="receipt-cash"
            value={moneyAccountId}
            onChange={(e) => setMoneyAccountId(e.target.value)}
          >
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Upload & review"}
        </Button>
      </form>
    </Dialog>
  );
}
