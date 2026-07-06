"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { VoidConfirmDialog } from "./void-confirm-dialog";

type Props = {
  onContinue: () => void;
  disabled?: boolean;
  confirming?: boolean;
  className?: string;
  label?: string;
  confirmTitle?: string;
  confirmDetail?: string | null;
  confirmLabel?: string;
};

export function VoidTriggerButton({
  onContinue,
  disabled = false,
  confirming = false,
  className,
  label = "Void",
  confirmTitle,
  confirmDetail,
  confirmLabel,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-8 px-2 text-destructive hover:text-destructive",
          className,
        )}
        disabled={disabled || confirming}
        onClick={() => setConfirmOpen(true)}
      >
        {confirming ? "Voiding…" : label}
      </Button>
      <VoidConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        detail={confirmDetail}
        confirming={confirming}
        confirmLabel={confirmLabel}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onContinue();
        }}
      />
    </>
  );
}
