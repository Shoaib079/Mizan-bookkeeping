"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { VoidWarningBanner } from "./void-warning-banner";

type Props = {
  open: boolean;
  title?: string;
  detail?: string | null;
  confirming?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function VoidConfirmDialog({
  open,
  title = "Void this record?",
  detail,
  confirming = false,
  confirmLabel = "Continue to void",
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <VoidWarningBanner />
      {detail && (
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={confirming}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={confirming}
          onClick={onConfirm}
        >
          {confirming ? "Voiding…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
