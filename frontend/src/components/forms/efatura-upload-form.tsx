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
import { formatTry } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";

type InvoiceDraftRead = {
  id: string;
  status: string;
  supplier_name: string | null;
  linked_supplier_name: string | null;
  gross_kurus: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId?: string;
  initialFile?: File;
};

/** What to say, and where to go, once the upload comes back.
 *
 * A pure function because the interesting case is easy to get wrong and
 * impossible to see: with auto-post on for a trusted supplier, the invoice is
 * already in the ledger by the time this resolves. Routing to the review
 * screen anyway makes finished work look outstanding, and "Invoice uploaded"
 * never mentions the ledger — the one thing worth confirming.
 *
 * `navigateTo: null` means stay put. There is nothing to review.
 */
export function afterUpload(
  draft: InvoiceDraftRead,
  supplierId?: string,
): { message: string; navigateTo: string | null } {
  if (draft.status === "posted") {
    const supplier = draft.linked_supplier_name ?? draft.supplier_name;
    const amount = formatTry(draft.gross_kurus);
    // Names the supplier and the amount rather than saying "Posted". This is
    // the only confirmation an auto-posted invoice gets, and it should be
    // enough to notice that the wrong file went up.
    return {
      message: supplier
        ? `Posted to the ledger — ${supplier}, ${amount}`
        : `Posted to the ledger — ${amount}`,
      navigateTo: null,
    };
  }
  return {
    message: "Invoice uploaded",
    navigateTo: supplierId
      ? `/suppliers/${supplierId}?draft=${draft.id}`
      : `/record?invoice=${draft.id}`,
  };
}

export function EfaturaUploadForm({ open, onClose, supplierId, initialFile }: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      return;
    }
    if (initialFile) setFile(initialFile);
  }, [open, initialFile]);
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

      const next = afterUpload(draft, supplierId);
      toast(next.message);
      if (next.navigateTo) router.push(next.navigateTo);
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
