"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";
import { cn } from "@/lib/utils";

type ExportFormat = "excel" | "pdf";

type Props = {
  entityId: string;
  partnerId: string;
  disabled?: boolean;
};

export function PartnerLedgerDownloadMenu({
  entityId,
  partnerId,
  disabled,
}: Props) {
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
    if (!entityId || !partnerId) return;
    setBusy(format);
    setError(null);
    setOpen(false);
    const suffix = format === "pdf" ? "/export/pdf" : "/export";
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/partners/${partnerId}/ledger${suffix}`,
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
        disabled={disabled || !entityId || !partnerId || busy !== null}
        onClick={() => setOpen((value) => !value)}
        className="gap-1.5"
      >
        <Download className="size-4" />
        {busy ? "Downloading…" : "Download"}
        <ChevronDown className="size-4 opacity-70" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-card py-1 shadow-md",
          )}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => void download("excel")}
          >
            Excel (.xlsx)
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
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
