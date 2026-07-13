"use client";

/** Modal dialog — Esc/focus trap + optional dirty discard confirm (DESIGN_SYSTEM §10). */

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  onClose,
  children,
  className,
  dirty = false,
  onDiscard,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** When true, Esc/backdrop/X paths ask before closing. */
  dirty?: boolean;
  /** Called when the user confirms discarding unsaved changes. */
  onDiscard?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const focusedOnOpenRef = useRef(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      focusedOnOpenRef.current = false;
      setDiscardConfirmOpen(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setDiscardConfirmOpen(false);
    onDiscard?.();
    onClose();
  }, [onClose, onDiscard]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (discardConfirmOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setDiscardConfirmOpen(false);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose, discardConfirmOpen]);

  useEffect(() => {
    if (!open || focusedOnOpenRef.current) return;
    focusedOnOpenRef.current = true;
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    window.setTimeout(() => firstField?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          "relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-pop)]",
          className,
        )}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <Button
            variant="ghost"
            className="size-9 px-0"
            onClick={requestClose}
            aria-label="Close"
            type="button"
          >
            <X className="size-4" />
          </Button>
        </div>
        {children}
        {discardConfirmOpen && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/90 p-4"
            role="alertdialog"
            aria-labelledby={`${titleId}-discard`}
          >
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-pop)]">
              <h3
                id={`${titleId}-discard`}
                className="text-sm font-semibold"
              >
                Discard unsaved changes?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your changes have not been saved yet.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDiscardConfirmOpen(false)}
                >
                  Keep editing
                </Button>
                <Button type="button" variant="primary" onClick={confirmDiscard}>
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
