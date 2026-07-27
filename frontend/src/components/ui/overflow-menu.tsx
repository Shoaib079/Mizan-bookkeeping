"use client";

/** Overflow ("…") action menu — keeps secondary actions off the toolbar. */

import { MoreHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
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
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[13rem] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-pop)]"
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
              className="block w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
