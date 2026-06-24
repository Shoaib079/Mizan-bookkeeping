"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  apiDownload,
  triggerBlobDownload,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ReportSlug } from "@/lib/report-types";

type ExportFormat = "excel" | "pdf";

type Props = {
  entityId: string;
  reportSlug: ReportSlug;
  queryString: string;
  pdf?: boolean;
  disabled?: boolean;
};

export function ReportDownloadMenu({
  entityId,
  reportSlug,
  queryString,
  pdf = false,
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
    if (!entityId) return;
    setBusy(format);
    setError(null);
    setOpen(false);
    const suffix = format === "pdf" ? "/export/pdf" : "/export";
    const qs = queryString ? `?${queryString}` : "";
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/reports/${reportSlug}${suffix}${qs}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const items: { format: ExportFormat; label: string }[] = [
    { format: "excel", label: "Excel (.xlsx)" },
  ];
  if (pdf) items.push({ format: "pdf", label: "PDF" });

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !entityId || busy !== null}
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
          {items.map((item) => (
            <button
              key={item.format}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => void download(item.format)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
