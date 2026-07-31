/** UX6 — sidebar highlighting and legacy upload redirect. */

export const LEGACY_UPLOADS_REDIRECT = "/record";

export const LEGACY_UPLOADS_REDIRECTS: Record<string, string> = {
  "/uploads": LEGACY_UPLOADS_REDIRECT,
  // Sales "Close day" tab retired — drawer close lives under Add.
  "/close-day": LEGACY_UPLOADS_REDIRECT,
};

/** Paths that highlight the Record sidebar row when domain nav is collapsed.
 * Sales/delivery paths highlight their own sidebar rows now (IA v2). */
export function pathnameMatchesRecordIntent(pathname: string): boolean {
  if (pathname === "/record" || pathname === "/uploads") return true;
  if (pathname === "/expenses" || pathname.startsWith("/expenses/")) return true;
  return false;
}
