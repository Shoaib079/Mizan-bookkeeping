"use client";

/** Download a report for the period on screen.
 *
 * The dropdown lives in `DownloadMenu`, shared with the subledger and delivery
 * menus. What is specific to a report is the slug, the query string carrying
 * the period, and whether a PDF exists for it — several reports are Excel only.
 */

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";
import type { ReportSlug } from "@/lib/report-types";

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
  const fetchTo = async (suffix: string) => {
    if (!entityId) return;
    const qs = queryString ? `?${queryString}` : "";
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/reports/${reportSlug}${suffix}${qs}`,
    );
    triggerBlobDownload(blob, filename);
  };

  const items = [
    { label: "Excel (.xlsx)", run: () => fetchTo("/export") },
  ];
  if (pdf) items.push({ label: "PDF", run: () => fetchTo("/export/pdf") });

  return <DownloadMenu disabled={disabled || !entityId} items={items} />;
}
