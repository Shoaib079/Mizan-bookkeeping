"use client";

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

/** Excel + PDF for daily sales — split from sales-review-panel. */
export function SalesReviewExportMenu({
  entityId,
  exportQuery,
  disabled,
}: {
  entityId: string | null;
  exportQuery: string;
  disabled: boolean;
}) {
  if (!entityId) return null;

  const downloadExcel = async () => {
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/pos/daily-summaries/export?${exportQuery}`,
    );
    triggerBlobDownload(blob, filename);
  };

  const downloadPdf = async () => {
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/pos/daily-summaries/export/pdf?${exportQuery}`,
    );
    triggerBlobDownload(blob, filename);
  };

  return (
    <DownloadMenu
      disabled={disabled}
      items={[
        { label: "Excel (.xlsx)", run: downloadExcel },
        { label: "PDF", run: downloadPdf },
      ]}
    />
  );
}
