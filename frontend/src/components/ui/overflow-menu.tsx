"use client";

/** Overflow ("…") action menu — keeps secondary actions off the toolbar. */

import { MoreHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
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

export function OverflowMenu({ items, label = "More actions", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutsideClick(ref, open, close);

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
          "inline-flex h-9 items-center justify-center rounded-md border border-primary/40 bg-primary/5 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10",
          // A raw button, so it missed the hit area every <Button> gained.
          MOBILE_TOUCH_TARGET,
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          // Opens rightward on a phone, leftward above it. `right-0` alone
          // anchors the menu's right edge to the trigger's, so it extends
          // left by its own 13rem — correct when the trigger sits at the far
          // right of a desktop header, and off the screen entirely once the
          // actions wrap and the trigger ends up on the left.
          className="absolute left-0 z-20 mt-1 min-w-[13rem] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-pop)] sm:left-auto sm:right-0"
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
