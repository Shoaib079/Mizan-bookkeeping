"use client";

/** e-Fatura PDF/XML upload → invoice draft — Phase 9 Slice 3. */

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";

type InvoiceDraftRead = {
  id: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId?: string;
  initialFile?: File;
};

export function EfaturaUploadForm({ open, onClose, supplierId, initialFile }: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [file, setFile] = useState<File | null>(initialFile ?? null);

  useEffect(() => {
    if (initialFile) setFile(initialFile);
  }, [initialFile]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useRegisterUnsaved("efatura-upload", Boolean(file), open);

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
      const idempotencyKey = submitIdempotency.beginSubmit();
      const draft = await apiFetch<InvoiceDraftRead>(
        `/entities/${entityId}/invoices/efatura/draft`,
        { method: "POST", body, idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      onClose();
      setFile(null);
      toast("Invoice uploaded");
      const reviewPath = supplierId
        ? `/suppliers/${supplierId}?draft=${draft.id}`
        : `/record?invoice=${draft.id}`;
      router.push(reviewPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Supplier invoice (e-Fatura)" onClose={onClose}>
      <RecordingForBanner />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="efatura-file">e-Fatura file</Label>
          <FileUpload
            id="efatura-file"
            accept=".xml,.pdf,application/xml,application/pdf"
            file={file}
            acceptHint="PDF or XML"
            onFileChange={setFile}
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
