"use client";

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

/** Excel download for hand-recorded expenses — split from expenses-review-panel (S9). */
export function ExpensesReviewExportMenu({
  entityId,
  listQuery,
  disabled,
}: {
  entityId: string | null;
  listQuery: string;
  disabled: boolean;
}) {
  if (!entityId) return null;
  return (
    <DownloadMenu
      disabled={disabled}
      items={[
        {
          label: "Excel (.xlsx)",
          run: async () => {
            const { blob, filename } = await apiDownload(
              `/entities/${entityId}/expenses/export?${listQuery}`,
            );
            triggerBlobDownload(blob, filename);
          },
        },
      ]}
    />
  );
}
