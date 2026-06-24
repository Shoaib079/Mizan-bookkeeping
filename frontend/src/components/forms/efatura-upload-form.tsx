"use client";

/** e-Fatura PDF/XML upload → invoice draft — Phase 9 Slice 3. */

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

type InvoiceDraftRead = {
  id: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId?: string;
};

export function EfaturaUploadForm({ open, onClose, supplierId }: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!file) {
      setError("Choose an e-Fatura file (PDF or XML).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const draft = await apiFetch<InvoiceDraftRead>(
        `/entities/${entityId}/invoices/efatura/draft`,
        { method: "POST", body },
      );
      onClose();
      setFile(null);
      const reviewPath = supplierId
        ? `/suppliers/${supplierId}?draft=${draft.id}`
        : `/review/invoices/${draft.id}`;
      router.push(reviewPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Supplier invoice (e-Fatura)" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="efatura-file">e-Fatura file</Label>
          <input
            id="efatura-file"
            type="file"
            accept=".xml,.pdf,application/xml,application/pdf"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Upload & review"}
        </Button>
      </form>
    </Dialog>
  );
}
