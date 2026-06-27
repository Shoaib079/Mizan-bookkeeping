/** Document mousedown + Escape dismiss — DESIGN_SYSTEM §10 (Slice 11.14). */

import { useEffect, type RefObject } from "react";

type Options = {
  /** Listen for Escape (default true). */
  escape?: boolean;
};

/** Close when clicking outside `ref` or pressing Escape (mirrors combobox/date-input). */
export function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  options?: Options,
) {
  const escape = options?.escape !== false;

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open, onClose, ref]);

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
