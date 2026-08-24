"use client";

/** Invoice draft review — link supplier/platform, confirm, post — Phase 9 Slice 3. */

import { InvoiceDraftActionForms } from "@/components/invoice-draft/invoice-draft-action-forms";
import { InvoiceDraftSummary } from "@/components/invoice-draft/invoice-draft-summary";
import { useInvoiceDraftReview } from "@/components/invoice-draft/use-invoice-draft-review";
import { invoiceDraftCapabilities } from "@/lib/invoice-draft-capabilities";
import type { InvoiceDraftReviewProps } from "@/lib/invoice-draft-types";

export function InvoiceDraftReview({
  draftId,
  embedded = false,
  readOnly = false,
  onUpdated,
}: InvoiceDraftReviewProps) {
  const state = useInvoiceDraftReview({
    draftId,
    embedded,
    readOnly,
    onUpdated,
  });

  if (!state.entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar to review this invoice.
      </p>
    );
  }

  if (!state.draft) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }

  const caps = invoiceDraftCapabilities(state.draft, readOnly);

  return (
    <div className="space-y-4">
      <InvoiceDraftSummary
        draft={state.draft}
        caps={caps}
        onUpdated={onUpdated}
      />
      <InvoiceDraftActionForms
        draft={state.draft}
        caps={caps}
        suppliers={state.suppliers}
        platforms={state.platforms}
        expenseAccounts={state.expenseAccounts}
        selectedSupplierId={state.selectedSupplierId}
        setSelectedSupplierId={state.setSelectedSupplierId}
        selectedPlatformId={state.selectedPlatformId}
        setSelectedPlatformId={state.setSelectedPlatformId}
        expenseAccountId={state.expenseAccountId}
        setExpenseAccountId={state.setExpenseAccountId}
        rejectReason={state.rejectReason}
        setRejectReason={state.setRejectReason}
        linking={state.linking}
        linkingPlatform={state.linkingPlatform}
        confirming={state.confirming}
        posting={state.posting}
        rejecting={state.rejecting}
        unconfirming={state.unconfirming}
        settingKind={state.settingKind}
        showChangeType={state.showChangeType}
        setShowChangeType={state.setShowChangeType}
        onLinkPlatform={state.onLinkPlatform}
        onLinkSupplier={state.onLinkSupplier}
        onConfirm={state.onConfirm}
        onConfirmAndPost={state.onConfirmAndPost}
        onPost={state.onPost}
        onUnconfirm={state.onUnconfirm}
        onReject={state.onReject}
        onSetKind={state.onSetKind}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}
