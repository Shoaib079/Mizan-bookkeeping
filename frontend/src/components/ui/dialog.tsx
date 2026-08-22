"use client";

/** Modal dialog — Esc/focus trap + optional dirty discard confirm (DESIGN_SYSTEM §10). */

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import {
  discardChangesConfirmLabel,
  discardChangesMessage,
  discardChangesTitle,
} from "@/lib/account-menu-helpers";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  onClose,
  children,
  className,
  size = "default",
  mobilePresentation = "fullscreen",
  elevated = false,
  dirty = false,
  onDiscard,
  onCloseRef,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Compact fits short person-picker + payment forms. */
  /** "wide" is for a dialog whose content is a table.
   *
   * `default` caps at max-w-lg, which is right for a stack of form fields and
   * too narrow for anything with five columns of money — the profit
   * allocation preview clipped its last column and wrapped amounts mid-figure,
   * so "75.000,00 ₺" came out over two lines and the total you were checking
   * was off the edge. Only affects desktop; a phone dialog is full-width at
   * every size, and wide tables there scroll instead. */
  size?: "default" | "compact" | "wide";
  /** Mobile layout — sheet keeps context visible behind quick confirms/forms. */
  mobilePresentation?: "fullscreen" | "sheet";
  /** Raise sheet above other sheets (period unlock over void confirm). */
  elevated?: boolean;
  /** When true, Esc/backdrop/X paths ask before closing. */
  dirty?: boolean;
  /** Called when the user confirms discarding unsaved changes. */
  onDiscard?: () => void;
  /** Receives the guarded close handler (respects dirty confirm). */
  onCloseRef?: React.MutableRefObject<(() => void) | undefined>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const focusedOnOpenRef = useRef(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const isMobile = useIsMobileShell();

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
    if (!onCloseRef) return;
    onCloseRef.current = requestClose;
    return () => {
      onCloseRef.current = undefined;
    };
  }, [onCloseRef, requestClose]);

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

  const isMobileSheet = isMobile && mobilePresentation === "sheet";

  const overlay = (
    <div
      className={cn(
        "fixed inset-0 flex bg-black/30",
        isMobileSheet ? (elevated ? "z-[70] items-end p-0" : "z-[60] items-end p-0") : "z-50",
        isMobile && !isMobileSheet && "items-stretch p-0",
        !isMobile && "items-center justify-center p-4",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          "relative w-full overflow-y-auto border-border bg-card shadow-[var(--shadow-pop)]",
          isMobileSheet &&
            "max-h-[85dvh] rounded-t-2xl border-x-0 border-b-0 border-t pb-[env(safe-area-inset-bottom,0px)]",
          isMobile &&
            !isMobileSheet &&
            "flex min-h-0 flex-1 flex-col rounded-none border-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
          !isMobile && "rounded-lg border",
          !isMobile && size === "compact" && "max-h-[85vh] max-w-sm p-4",
          !isMobile && size === "default" && "max-h-[90vh] max-w-lg p-5",
          !isMobile && size === "wide" && "max-h-[90vh] max-w-3xl p-5",
          isMobile && "p-4",
          className,
        )}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
      >
        {isMobileSheet && (
          <div
            className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-border"
            aria-hidden
          />
        )}
        <div
          className={cn(
            "flex items-center justify-between",
            size === "compact" ? "mb-3" : "mb-4",
          )}
        >
          <h2
            id={titleId}
            className={cn(
              "font-semibold",
              size === "compact" ? "text-sm" : "text-base",
            )}
          >
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
                {discardChangesTitle()}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {discardChangesMessage()}
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
                  {discardChangesConfirmLabel()}
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
