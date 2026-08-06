"use client";

/** Download this ledger as Excel or PDF.
 *
 * One menu for all four subledgers — partner, staff, customer, supplier. Only
 * the URL differs, and this began as the partner's own copy; a second one
 * would have been the same 90 lines with a different noun, and the fourth
 * would have drifted from the first.
 *
 * `basePath` is the ledger endpoint without a suffix, because both routes
 * hang off it: `/export` for the workbook and `/export/pdf` for the statement.
 */

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

type ExportFormat = "excel" | "pdf";

export function SubledgerDownloadMenu({
  basePath,
  disabled,
}: {
  /** e.g. `/entities/{id}/partners/{id}/ledger` — no trailing slash. */
  basePath: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
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

  const download = async (format: ExportFormat) => {
    if (!basePath) return;
    setBusy(format);
    setError(null);
    setOpen(false);
    try {
      const { blob, filename } = await apiDownload(
        `${basePath}${format === "pdf" ? "/export/pdf" : "/export"}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="primary"
        disabled={disabled || !basePath || busy !== null}
        onClick={() => setOpen((value) => !value)}
        className="gap-1.5"
      >
        <Download className="size-4" />
        {busy ? "Downloading…" : "Download"}
        <ChevronDown className="size-4 opacity-70" />
      </Button>
      {open && (
        // Anchored left on a phone: the action row wraps there, so a
        // right-anchored menu opened off the edge of the screen.
        <div
          className={cn(
            "absolute left-0 z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-card py-1 shadow-md max-w-[calc(100vw-1.75rem)] sm:left-auto sm:right-0",
          )}
        >
          <button
            type="button"
            className={cn(
              "block w-full px-3 py-2 text-left text-sm hover:bg-primary/10",
              MOBILE_TOUCH_TARGET,
            )}
            onClick={() => void download("excel")}
          >
            Excel (.xlsx)
          </button>
          <button
            type="button"
            className={cn(
              "block w-full px-3 py-2 text-left text-sm hover:bg-primary/10",
              MOBILE_TOUCH_TARGET,
            )}
            onClick={() => void download("pdf")}
          >
            PDF
          </button>
        </div>
      )}
      {error && (
        <p className="absolute right-0 mt-1 whitespace-nowrap text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
