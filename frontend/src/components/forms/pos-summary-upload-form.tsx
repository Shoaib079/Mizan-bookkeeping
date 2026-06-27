"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";
import type { PosDailySummary } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PosSummaryUploadForm({ open, onClose }: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useRegisterUnsaved("pos-summary-upload", Boolean(file), open);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!file) {
      setError("Choose a POS daily-summary photo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const summary = await apiFetch<PosDailySummary>(
        `/entities/${entityId}/pos/daily-summaries`,
        { method: "POST", body, idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      onClose();
      setFile(null);
      toast("POS summary uploaded");
      router.push(`/sales/${summary.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="POS daily summary (photo)" onClose={onClose}>
      <RecordingForBanner />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="pos-summary-file">POS summary photo</Label>
          <input
            id="pos-summary-file"
            type="file"
            accept="image/*,.txt"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Upload the end-of-day POS slip. Amounts are read automatically for
            review before posting.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Upload & review"}
        </Button>
      </form>
    </Dialog>
  );
}
