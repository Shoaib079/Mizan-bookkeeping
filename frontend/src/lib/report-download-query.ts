/** Period query string plus the on-screen sealed/live view.

 * Download used to reuse only the date query and drop ``view``, so Excel/PDF
 * could disagree with the figures on the page. One helper keeps them tied.
 */

import type { ReportSource } from "@/lib/report-types";

export function reportDownloadQuery(
  periodQueryString: string,
  view: ReportSource,
): string {
  const trimmed = periodQueryString.replace(/^&+|&+$/g, "");
  return trimmed ? `${trimmed}&view=${view}` : `view=${view}`;
}
