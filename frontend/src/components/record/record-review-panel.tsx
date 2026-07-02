"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { ReceiptReview } from "@/components/receipt-review";
import { Dialog } from "@/components/ui/dialog";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";

function RecordReviewPanelInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { entityId } = useEntity();

  const invoiceId = searchParams.get("invoice");
  const receiptId = searchParams.get("receipt");
  const open = Boolean(invoiceId || receiptId);

  const clearReview = useCallback(() => {
    router.replace("/record");
  }, [router]);

  useEntitySwitchReset(entityId, clearReview);

  function handleUpdated(outcome?: "removed" | "updated") {
    if (outcome === "removed") clearReview();
  }

  const title = invoiceId ? "Review uploaded invoice" : "Review uploaded receipt";

  return (
    <Dialog
      open={open}
      title={title}
      onClose={clearReview}
      className="max-w-5xl"
    >
      {invoiceId && (
        <InvoiceDraftReview
          draftId={invoiceId}
          embedded
          onUpdated={handleUpdated}
        />
      )}
      {receiptId && (
        <ReceiptReview
          intakeId={receiptId}
          embedded
          onUpdated={handleUpdated}
        />
      )}
    </Dialog>
  );
}

export function RecordReviewPanel() {
  return (
    <Suspense fallback={null}>
      <RecordReviewPanelInner />
    </Suspense>
  );
}
