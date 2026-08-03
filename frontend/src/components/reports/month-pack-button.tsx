"use client";

/** Download every book for the period — one colorful button, then Excel or PDF. */

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  /** Already-built `from=…&to=…` for the chosen period. */
  queryString: string;
  disabled?: boolean;
  /** Compact sticky-bar style for mobile reports (C4.6). */
  compact?: boolean;
};

type Format = "xlsx" | "pdf";

export function MonthPackButton({ entityId, queryString, disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutsideClick(menuRef, open, close);

  async function download(format: Format) {
    if (!entityId) return;
    setBusy(format);
    setError(null);
    setOpen(false);
    try {
      const path =
        format === "pdf"
          ? `/entities/${entityId}/reports/month-pack/export/pdf?${queryString}`
          : `/entities/${entityId}/reports/month-pack?${queryString}`;
      const { blob, filename } = await apiDownload(path);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-1",
        compact ? "shrink-0 items-stretch" : "items-end",
      )}
      ref={menuRef}
    >
      <Button
        type="button"
        variant={compact ? "secondary" : "primary"}
        disabled={disabled || !entityId || busy !== null}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cn("gap-1.5", compact && "h-10 px-3")}
      >
        <Download className="size-4 shrink-0" />
        {busy ? "Preparing…" : compact ? "Download" : "Download all"}
        {!compact && (
          <ChevronDown
            className={cn(
              "size-4 opacity-80 transition",
              open && "rotate-180",
            )}
          />
        )}
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-[var(--shadow-pop)]"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Choose format
          </p>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            onClick={() => void download("xlsx")}
          >
            <FileSpreadsheet
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Excel</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                Full detail — filter, sort, total columns
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            onClick={() => void download("pdf")}
          >
            <FileText
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">PDF</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                Readable partner copy for print or share
              </span>
            </span>
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
