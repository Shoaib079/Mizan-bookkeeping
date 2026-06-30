/** UX6 — six-intent sidebar highlighting and legacy upload redirect. */

export const LEGACY_UPLOADS_REDIRECT = "/record";

export const LEGACY_UPLOADS_REDIRECTS: Record<string, string> = {
  "/uploads": LEGACY_UPLOADS_REDIRECT,
};

/** Paths that highlight the Record sidebar row when domain nav is collapsed. */
export function pathnameMatchesRecordIntent(pathname: string): boolean {
  if (pathname === "/record" || pathname === "/uploads") return true;
  if (pathname === "/expenses" || pathname.startsWith("/expenses/")) return true;
  if (pathname === "/sales" || pathname.startsWith("/sales/")) return true;
  if (pathname === "/cards" || pathname.startsWith("/cards/")) return true;
  if (pathname === "/close-day") return true;
  if (pathname.startsWith("/delivery")) return true;
  return false;
}

/** Paths that highlight the Balances sidebar row when domain nav is collapsed. */
export function pathnameMatchesBalancesIntent(pathname: string): boolean {
  if (pathname === "/balances" || pathname.startsWith("/balances/")) return true;
  if (pathname === "/payables" || pathname === "/receivables") return true;
  return false;
}
