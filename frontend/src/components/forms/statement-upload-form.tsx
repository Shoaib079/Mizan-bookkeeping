"use client";

/** Bank statement CSV/Excel upload — Phase 9 Slice 4. */

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { BankStatementRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
  moneyAccountId: string;
  onUploaded?: () => void;
};

const ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

export function StatementUploadForm({
  open,
  onClose,
  moneyAccountId,
  onUploaded,
}: Props) {
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!file) {
      setError("Choose a CSV or Excel statement file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const statement = await apiFetch<BankStatementRead>(
        `/entities/${entityId}/banking/accounts/${moneyAccountId}/statements`,
        { method: "POST", body, idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      onUploaded?.();
      toast("Statement imported");
      onClose();
      setFile(null);
      router.push(`/banking/statements/${statement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Upload bank statement" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          CSV or Excel with columns: transaction_date (YYYY-MM-DD), amount in
          lira (e.g. 12,50 or -1.234,56), description, optional reference.
          Lines that cannot be auto-matched go to Needs Review.
        </p>
        <div>
          <Label htmlFor="stmt-file">Statement file</Label>
          <input
            id="stmt-file"
            type="file"
            accept={ACCEPT}
            className="mt-1 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Upload statement"}
        </Button>
      </form>
    </Dialog>
  );
}
