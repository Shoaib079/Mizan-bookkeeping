/** Document mousedown + Escape dismiss — DESIGN_SYSTEM §10 (Slice 11.14). */

import { useEffect, type RefObject } from "react";

type Options = {
  /** Listen for Escape (default true). */
  escape?: boolean;
  /** Portaled content that still counts as inside (calendar / listbox). */
  portalRef?: RefObject<HTMLElement | null>;
};

/** Close when clicking outside `ref` (+ optional portal) or pressing Escape. */
export function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  options?: Options,
) {
  const escape = options?.escape !== false;
  const portalRef = options?.portalRef;

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (portalRef?.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open, onClose, ref, portalRef]);

  useEffect(() => {
    if (!open || !escape) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, escape]);
}
