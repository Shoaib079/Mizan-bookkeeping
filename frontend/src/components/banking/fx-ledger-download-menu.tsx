"use client";

/** Excel + PDF for the FX hub merged ledger. */

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

type Props = {
  entityId: string | null;
  exportQuery: string;
  disabled?: boolean;
};

export function FxLedgerDownloadMenu({
  entityId,
  exportQuery,
  disabled,
}: Props) {
  const downloadExcel = async () => {
    if (!entityId) return;
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/fx/ledger/export?${exportQuery}`,
    );
    triggerBlobDownload(blob, filename);
  };

  const downloadPdf = async () => {
    if (!entityId) return;
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/fx/ledger/export/pdf?${exportQuery}`,
    );
    triggerBlobDownload(blob, filename);
  };

  return (
    <DownloadMenu
      disabled={disabled || !entityId}
      items={[
        { label: "Excel (.xlsx)", run: downloadExcel },
        { label: "PDF", run: downloadPdf },
      ]}
    />
  );
}
