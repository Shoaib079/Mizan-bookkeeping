"use client";

import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AccountMenuConfirmOverlay({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      role="alertdialog"
      aria-modal
      aria-labelledby="account-confirm-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-pop)]">
        <h3 id="account-confirm-title" className="text-sm font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
