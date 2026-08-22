"use client";

/** The Download dropdown, once.
 *
 * There were three of these — the four subledgers', the reports', and the
 * delivery hub's. The same ninety lines each time: trigger, outside-click ref,
 * a `busy` label, an absolutely-positioned card, an error line. Only the items
 * ever differed, and they differ for good reason: Excel and PDF for a ledger,
 * Excel plus an optional PDF for a report, two Excel scopes for delivery. So
 * the shell is shared and the items are the caller's.
 *
 * Reading the three side by side is what found the reason to bother:
 *
 * - `MOBILE_TOUCH_TARGET` was on the subledger menu's items and neither of the
 *   others', so two of the three had ~36px rows on a phone against the 44px a
 *   thumb needs. `mobile-touch-targets.test.ts` named all three, but it only
 *   ever checked where the menu opened, never how tall its items were.
 * - One item in the delivery menu hovered `bg-muted` where every other item in
 *   every menu hovered `bg-primary/10`.
 * - The trigger was `primary` in one and `secondary` in two, which turned out
 *   to be nothing: `Button` renders those identically, on purpose.
 *
 * None of those were findable in any one file. They are the whole argument for
 * this component existing.
 */

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { canExportFiles } from "@/lib/entity-access";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

export type DownloadMenuItem = {
  /** Shown in the menu, and used as the key — so make them distinct. */
  label: string;
  /** Rejections are caught and shown under the trigger. */
  run: () => Promise<void>;
  disabled?: boolean;
};

export function DownloadMenu({
  items,
  disabled,
}: {
  items: DownloadMenuItem[];
  disabled?: boolean;
}) {
  const { grants } = useEntityAccess();
  if (!canExportFiles(grants)) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Exports require owner or partner access.
      </p>
    );
  }

  return (
    <DownloadMenuInner items={items} disabled={disabled} />
  );
}

function DownloadMenuInner({
  items,
  disabled,
}: {
  items: DownloadMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function select(item: DownloadMenuItem) {
    setBusy(true);
    setError(null);
    setOpen(false);
    try {
      await item.run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    // A column rather than an absolutely-positioned error: two of the three
    // hung the message over whatever was beneath them, which on a header row
    // is the page's own content.
    <div className="flex flex-col items-end gap-1">
      <div className="relative" ref={menuRef}>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => setOpen((value) => !value)}
          className="gap-1.5"
        >
          <Download className="size-4" />
          {busy ? "Downloading…" : "Download"}
          <ChevronDown className="size-4 opacity-70" />
        </Button>
        {open && (
          // Anchored left on a phone: the action rows wrap there, so the
          // trigger lands on the left and a right-anchored menu opened off the
          // edge of the screen.
          <div
            className={cn(
              "absolute left-0 z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-card py-1 shadow-md max-w-[calc(100vw-1.75rem)] sm:left-auto sm:right-0",
            )}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-sm hover:bg-primary/10 disabled:opacity-50",
                  MOBILE_TOUCH_TARGET,
                )}
                onClick={() => void select(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
