"use client";

/** Download this ledger as Excel or PDF.
 *
 * One menu for all four subledgers — partner, staff, customer, supplier. Only
 * the URL differs, and this began as the partner's own copy; a second one
 * would have been the same ninety lines with a different noun, and the fourth
 * would have drifted from the first.
 *
 * The dropdown itself now lives in `DownloadMenu`, shared with the reports and
 * delivery menus. What is left here is the pair of endpoints, which is all
 * that was ever specific to a ledger.
 *
 * `basePath` is the ledger endpoint without a suffix, because both routes hang
 * off it: `/export` for the workbook and `/export/pdf` for the statement.
 */

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

export function SubledgerDownloadMenu({
  basePath,
  disabled,
}: {
  /** e.g. `/entities/{id}/partners/{id}/ledger` — no trailing slash. */
  basePath: string | null;
  disabled?: boolean;
}) {
  const fetchTo = async (suffix: string) => {
    if (!basePath) return;
    const { blob, filename } = await apiDownload(`${basePath}${suffix}`);
    triggerBlobDownload(blob, filename);
  };

  return (
    <DownloadMenu
      disabled={disabled || !basePath}
      items={[
        { label: "Excel (.xlsx)", run: () => fetchTo("/export") },
        { label: "PDF", run: () => fetchTo("/export/pdf") },
      ]}
    />
  );
}
