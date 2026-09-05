"use client";

/** Overflow ("…") action menu — keeps secondary actions off the toolbar. */

import { MoreHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  DROPDOWN_VIEWPORT_MAX_W,
  dropdownHAlignClass,
} from "@/lib/dropdown-align";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useDropdownHAlign } from "@/lib/use-dropdown-align";
import { cn } from "@/lib/utils";

export type OverflowMenuItem = {
  label: string;
  onSelect: () => void;
  /** Hidden when false — use for conditional actions. */
  show?: boolean;
  title?: string;
};

type Props = {
  items: OverflowMenuItem[];
  label?: string;
  className?: string;
};

/** ~13rem — matches min-w on the panel. */
const MENU_MIN_WIDTH_PX = 208;

export function OverflowMenu({ items, label = "More actions", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutsideClick(ref, open, close);
  const hAlign = useDropdownHAlign(open, ref, MENU_MIN_WIDTH_PX);

  const visible = items.filter((item) => item.show !== false);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          // A raw button, so it missed the hit area every <Button> gained.
          MOBILE_TOUCH_TARGET,
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-20 mt-1 min-w-[13rem] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-pop)]",
            DROPDOWN_VIEWPORT_MAX_W,
            dropdownHAlignClass(hAlign),
          )}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              title={item.title}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "block w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10",
                MOBILE_TOUCH_TARGET,
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
