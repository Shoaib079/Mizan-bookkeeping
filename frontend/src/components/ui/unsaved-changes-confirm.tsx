"use client";

import { Button } from "@/components/ui/button";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import {
  discardChangesConfirmLabel,
  discardChangesMessage,
  discardChangesTitle,
} from "@/lib/account-menu-helpers";
import { cn } from "@/lib/utils";

type Props = {
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnsavedChangesConfirm({ onCancel, onConfirm }: Props) {
  const isMobile = useIsMobileShell();

  return (
    <div
      className={cn(
        "fixed inset-0 flex bg-black/30",
        isMobile ? "z-[70] items-end p-0" : "z-[60] items-center justify-center p-4",
      )}
      role="alertdialog"
      aria-modal
      aria-labelledby="unsaved-changes-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          "w-full border-border bg-card shadow-[var(--shadow-pop)]",
          isMobile
            ? "max-w-none rounded-t-2xl border-x-0 border-b-0 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
            : "max-w-sm rounded-lg border p-4",
        )}
      >
        {isMobile && (
          <div
            className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-border"
            aria-hidden
          />
        )}
        <h3 id="unsaved-changes-title" className="text-sm font-semibold">
          {discardChangesTitle()}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {discardChangesMessage()}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Keep editing
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {discardChangesConfirmLabel()}
          </Button>
        </div>
      </div>
    </div>
  );
}
