"use client";

/** Download every book for the period as one workbook.
 *
 * Checking a month used to mean six separate downloads, and four of the books
 * had no export at all. This is the file you send partners.
 */

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

type Props = {
  entityId: string;
  /** Already-built `from=…&to=…` for the chosen period. */
  queryString: string;
  disabled?: boolean;
};

export function MonthPackButton({ entityId, queryString, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!entityId) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/reports/month-pack?${queryString}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        disabled={disabled || !entityId || busy}
        onClick={() => void download()}
        className="gap-1.5"
      >
        <Download className="size-4" />
        {busy ? "Preparing…" : "Download all books"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
