"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  from: string;
  to: string;
  exportQuery: string;
  platformId: string | null;
  platformName?: string;
  onRangeChange: (from: string, to: string) => void;
  disabled?: boolean;
};

export function DeliveryHubToolbar({
  entityId,
  from,
  to,
  exportQuery,
  platformId,
  platformName,
  onRangeChange,
  disabled,
}: Props) {
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

  async function download(combined: boolean) {
    if (!entityId) return;
    setBusy(true);
    setError(null);
    setOpen(false);
    const params = new URLSearchParams(exportQuery);
    if (!combined) {
      if (!platformId) {
        setError("Select one platform for a single-platform export.");
        setBusy(false);
        return;
      }
      params.set("delivery_platform_id", platformId);
    } else {
      params.delete("delivery_platform_id");
    }
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/delivery/activity/export?${params.toString()}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={disabled || !entityId}
          onChange={onRangeChange}
        />
        <div className="relative" ref={menuRef}>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !entityId || busy}
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
                "absolute right-0 z-20 mt-1 min-w-[14rem] rounded-md border border-border bg-card py-1 shadow-md",
              )}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => void download(true)}
              >
                Excel — all platforms
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                disabled={!platformId}
                onClick={() => void download(false)}
              >
                Excel — {platformName ?? "selected platform"}
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
