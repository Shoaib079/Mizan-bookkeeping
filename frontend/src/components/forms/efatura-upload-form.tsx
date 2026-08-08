"use client";

/** e-Fatura PDF/XML upload → invoice draft — Phase 9 Slice 3. */

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatTrDate, formatTry } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";

type InvoiceDraftRead = {
  id: string;
  status: string;
  supplier_name: string | null;
  linked_supplier_name: string | null;
  invoice_number: string;
  invoice_date: string;
  net_kurus: number;
  gross_kurus: number;
  currency: string;
  journal_entry_id: string | null;
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
): { showReceipt: boolean; message: string | null; navigateTo: string | null } {
  if (draft.status === "posted") {
    // A receipt, not a toast. Auto-post puts money in the books without
    // anyone reading a screen, so the one moment it can be checked is now —
    // and a line that fades after four seconds is not a place to check the
    // supplier, the number and the amount. It stays until dismissed.
    return { showReceipt: true, message: null, navigateTo: null };
  }
  return {
    showReceipt: false,
    message: "Invoice uploaded",
    navigateTo: supplierId
      ? `/suppliers/${supplierId}?draft=${draft.id}`
      : `/record?invoice=${draft.id}`,
  };
}

/** The supplier as the books know it, falling back to what the file said. */
export function receiptSupplier(draft: InvoiceDraftRead): string {
  return draft.linked_supplier_name ?? draft.supplier_name ?? "Unknown supplier";
}

export function receiptAmount(draft: InvoiceDraftRead): string {
  // Gross is what lands in payables, and it is the figure on the paper.
  return formatTry(draft.gross_kurus);
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

  const [posted, setPosted] = useState<InvoiceDraftRead | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setPosted(null);
      return;
    }
    if (initialFile) setFile(initialFile);
  }, [open, initialFile]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Not "unsaved" once it is in the ledger — the receipt is a confirmation,
  // not a draft, and warning about losing work on the way out would be wrong.
  useRegisterUnsaved("efatura-upload", Boolean(file) && posted === null, open);

  function dismissReceipt() {
    setPosted(null);
    onClose();
  }

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
      setFile(null);

      const next = afterUpload(draft, supplierId);
      if (next.showReceipt) {
        // The dialog stays open and becomes the receipt. Closing first and
        // opening a second dialog loses the modal on the way through.
        setPosted(draft);
        return;
      }
      onClose();
      if (next.message) toast(next.message);
      if (next.navigateTo) router.push(next.navigateTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (posted) {
    return (
      <Dialog open={open} title="Invoice posted" onClose={dismissReceipt}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">
                Posted to the ledger
              </p>
              <p className="mt-0.5 text-muted-foreground">
                This supplier is trusted, so the invoice was posted on upload.
                Nothing is waiting for you in Review.
              </p>
            </div>
          </div>

          <dl className="divide-y divide-border rounded-md border border-border">
            {[
              ["Supplier", receiptSupplier(posted)],
              ["Invoice no.", posted.invoice_number],
              ["Invoice date", formatTrDate(posted.invoice_date)],
              ["Net", formatTry(posted.net_kurus)],
              ["KDV", formatTry(posted.gross_kurus - posted.net_kurus)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium text-foreground">
                  {value}
                </dd>
              </div>
            ))}
            {/* Gross last and heavier: it is the figure that reaches payables
                and the one worth checking against the paper. */}
            <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
              <dt className="text-sm font-medium text-foreground">Total</dt>
              <dd className="text-right text-base font-semibold text-foreground tabular-nums">
                {receiptAmount(posted)}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Wrong invoice? Open it and void it — the entry stays in the ledger
            with its reversal, so the correction is visible rather than silent.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const id = posted.id;
                dismissReceipt();
                router.push(
                  supplierId
                    ? `/suppliers/${supplierId}?draft=${id}`
                    : `/record?invoice=${id}`,
                );
              }}
            >
              View invoice
            </Button>
            <Button type="button" onClick={dismissReceipt}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
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
