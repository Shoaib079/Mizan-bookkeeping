/** Measure the trigger and pick a dropdown side that stays on screen. */

import { useLayoutEffect, useState, type RefObject } from "react";

import {
  dropdownHAlignFromRect,
  type DropdownHAlign,
} from "@/lib/dropdown-align";

export function useDropdownHAlign(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  menuMinWidthPx: number,
): DropdownHAlign {
  // Prefer right-anchor before measure — header "…" is usually on the right.
  const [align, setAlign] = useState<DropdownHAlign>("right");

  useLayoutEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    setAlign(
      dropdownHAlignFromRect(
        { left: rect.left, right: rect.right },
        window.innerWidth,
        menuMinWidthPx,
      ),
    );
  }, [open, containerRef, menuMinWidthPx]);

  return align;
}
