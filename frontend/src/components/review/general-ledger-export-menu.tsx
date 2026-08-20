"use client";

import { useMemo } from "react";

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

/** Excel download for the general ledger — split from general-ledger-panel (S9). */
export function GeneralLedgerExportMenu({
  entityId,
  from,
  to,
  q,
  source,
  status,
  showHistory,
  disabled,
}: {
  entityId: string | null;
  from: string;
  to: string;
  q: string;
  source: string;
  status: string;
  showHistory: boolean;
  disabled: boolean;
}) {
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q.trim()) params.set("q", q.trim());
    if (source) params.set("source", source);
    if (showHistory) {
      if (status) params.set("status", status);
      params.set("effective_only", "false");
    } else {
      params.set("effective_only", "true");
    }
    return params.toString();
  }, [from, to, q, source, status, showHistory]);

  if (!from || !to || !entityId) return null;

  return (
    <DownloadMenu
      disabled={disabled}
      items={[
        {
          label: "Excel (.xlsx)",
          run: async () => {
            const { blob, filename } = await apiDownload(
              `/entities/${entityId}/ledger/entries/export?${exportQuery}`,
            );
            triggerBlobDownload(blob, filename);
          },
        },
      ]}
    />
  );
}
