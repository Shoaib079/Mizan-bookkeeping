"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

/** Supplier activity Excel export control — split from supplier-activity-panel (S9). */
export function SupplierActivityExportButton({
  entityId,
  supplierId,
  from,
  to,
  disabled,
}: {
  entityId: string | null;
  supplierId: string;
  from: string;
  to: string;
  disabled: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function onExport() {
    if (!entityId) return;
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/suppliers/${supplierId}/activity/export?from_date=${from}&to_date=${to}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/* Secondary, matching ReportDownloadMenu on the report screens.
          Exporting supports the task; choosing the period is the task, and
          two filled buttons side by side say neither is the main one. */}
      <Button
        type="button"
        variant="secondary"
        disabled={!entityId || exporting || disabled}
        onClick={() => void onExport()}
      >
        {exporting ? "Exporting…" : "Export Excel"}
      </Button>
      {exportError && (
        <p className="text-sm text-destructive">{exportError}</p>
      )}
    </>
  );
}
