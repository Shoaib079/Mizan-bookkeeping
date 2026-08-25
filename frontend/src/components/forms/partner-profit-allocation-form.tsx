"use client";

import { PartnerProfitAllocationFields } from "@/components/forms/partner-profit-allocation-fields";
import { PartnerProfitAllocationPreview } from "@/components/forms/partner-profit-allocation-preview";
import { usePartnerProfitAllocationForm } from "@/components/forms/use-partner-profit-allocation-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function PartnerProfitAllocationForm({ open, onClose, onSaved }: Props) {
  const form = usePartnerProfitAllocationForm({ open, onClose, onSaved });

  return (
    // `wide`: the preview is a five-column money table, and at the default
    // width the Allocate column fell off the edge — the one figure you open
    // this to check before confirming.
    <Dialog
      open={open}
      title="Allocate profit to partners"
      size="wide"
      onClose={onClose}
    >
      <form onSubmit={form.onSubmit} className="space-y-4">
        <PartnerProfitAllocationFields
          allocationDateText={form.allocationDateText}
          onAllocationDateChange={(v) => {
            form.setAllocationDateText(v);
            form.clearPreview();
          }}
          amountText={form.amountText}
          onAmountChange={(v) => {
            form.setAmountText(v);
            form.clearPreview();
          }}
          periodFromText={form.periodFromText}
          onPeriodFromChange={(v) => {
            form.setPeriodFromText(v);
            form.clearPreview();
          }}
          periodToText={form.periodToText}
          onPeriodToChange={(v) => {
            form.setPeriodToText(v);
            form.clearPreview();
          }}
          description={form.description}
          onDescriptionChange={form.setDescription}
          netAgainstDrawings={form.netAgainstDrawings}
          onNetAgainstDrawingsChange={(v) => {
            form.setNetAgainstDrawings(v);
            form.clearPreview();
          }}
          previewLoading={form.previewLoading}
          onPreview={() => void form.loadPreview()}
        />

        {form.preview && (
          <PartnerProfitAllocationPreview
            preview={form.preview}
            sourceBanner={form.sourceBanner}
          />
        )}

        {form.error && (
          <p className="text-sm text-destructive">{form.error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.submitting || !form.preview}>
            {form.submitting ? "Posting…" : "Confirm allocation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
