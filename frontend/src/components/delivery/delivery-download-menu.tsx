"use client";

/** The Excel export for the delivery hub, as a header action.
 *
 * It used to be half of a `DeliveryHubToolbar` that also owned the date range
 * and sat *above* the page header — the only two pages in the app to run in
 * that order. The cost was not just inconsistency: the toolbar's Download
 * landed directly above the header's "Record sales", right-aligned and the
 * same width, so the two read as one open dropdown with the page title
 * stranded beside it. Splitting them puts these pages back on the report
 * archetype — title and its actions first, period control underneath.
 *
 * The dropdown itself is `DownloadMenu`, shared with the reports and subledger
 * menus. Specific to delivery is only the choice of scope: every platform, or
 * the one the filter has narrowed to.
 */

import { DownloadMenu } from "@/components/ui/download-menu";
import { apiDownload, triggerBlobDownload } from "@/lib/api";

type Props = {
  entityId: string;
  exportQuery: string;
  platformId: string | null;
  platformName?: string;
  disabled?: boolean;
};

export function DeliveryDownloadMenu({
  entityId,
  exportQuery,
  platformId,
  platformName,
  disabled,
}: Props) {
  const download = async (combined: boolean) => {
    if (!entityId) return;
    const params = new URLSearchParams(exportQuery);
    if (combined) {
      params.delete("delivery_platform_id");
    } else {
      // Reachable only if the item below stops being disabled. Thrown rather
      // than dropped, because the alternative is silently exporting every
      // platform when one was asked for.
      if (!platformId) {
        throw new Error("Select one platform for a single-platform export.");
      }
      params.set("delivery_platform_id", platformId);
    }
    const { blob, filename } = await apiDownload(
      `/entities/${entityId}/delivery/activity/export?${params.toString()}`,
    );
    triggerBlobDownload(blob, filename);
  };

  return (
    <DownloadMenu
      disabled={disabled || !entityId}
      items={[
        { label: "Excel — all platforms", run: () => download(true) },
        {
          label: `Excel — ${platformName ?? "selected platform"}`,
          run: () => download(false),
          disabled: !platformId,
        },
      ]}
    />
  );
}
