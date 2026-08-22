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
  title = "Are you sure?",
  detail,
  confirming = false,
  confirmLabel = "Void",
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      size="compact"
      mobilePresentation="sheet"
    >
      <div
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      >
        <VoidWarningBanner />
        {detail && (
          <p className="mt-3 text-sm text-foreground">{detail}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
          autoFocus
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={confirming}
        >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "Voiding…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
