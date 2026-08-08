/** Mobile shell (C4) — breakpoint, tab roots, drill-in detection. */

export const MOBILE_SHELL_MAX_WIDTH_PX = 819;

/** How much room the fixed bottom tab bar takes, plus the phone's home
 * indicator.
 *
 * Anything that pins itself to the bottom of the mobile viewport has to clear
 * this or it renders underneath the tabs. `AppShell` uses it as padding on
 * `<main>`; `FormPage` uses it to offset its sticky save bar, which sat behind
 * the tab bar until this became a shared value. Two hand-written copies of a
 * number that has to agree is how they stop agreeing.
 */
/** Padding that keeps scrolling content clear of the tabs (`AppShell`). */
export const MOBILE_TAB_BAR_PADDING =
  "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]";

/** Minimum comfortable hit area on a phone: 44px, per the iOS and Android
 * guidelines.
 *
 * Applied as a CSS media query rather than through `useIsMobileShell` so it is
 * correct on the first paint — a button that resizes after hydration is worse
 * than one that was always small. The 819 must match
 * `MOBILE_SHELL_MAX_WIDTH_PX`; a test holds them together, because Tailwind
 * needs the literal and cannot read the constant.
 *
 * `min-h` rather than `h`: callers set `h-8` for desktop row rhythm and
 * min-height wins over height only where it is larger, so desktop is untouched.
 */
export const MOBILE_TOUCH_TARGET = "max-[819px]:min-h-11";

/** Hides desktop-only chrome below the breakpoint, in CSS rather than in JS.
 *
 * `useIsMobileShell` starts `false` — it cannot call matchMedia until after
 * hydration — so the very first paint on a phone is the *desktop* shell. The
 * sidebar, wordmark and logo render, the effect runs, and the whole thing is
 * replaced by the mobile shell. That is the flash: the logo appears and
 * vanishes on every load, worst on a slow connection where the gap is longest.
 *
 * Applying this to the desktop chrome means a narrow viewport never paints it,
 * whatever JS believes. Same reasoning as MOBILE_TOUCH_TARGET above, and the
 * same 819 that a test holds against MOBILE_SHELL_MAX_WIDTH_PX, since Tailwind
 * needs the literal and cannot read the constant.
 */
export const DESKTOP_CHROME_ONLY = "max-[819px]:hidden";

/** Offset that lifts a bottom-pinned element above the tabs (`FormPage`).
 *
 * Written out in full rather than composed from a raw measurement: Tailwind
 * scans source for complete class strings, so a class built by interpolation
 * generates no CSS at all — it fails silently and looks like a layout bug.
 */
export const MOBILE_TAB_BAR_OFFSET =
  "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]";

/** The same lift for toasts, applied in CSS rather than through JS.
 *
 * Toasts are rendered by `ToastProvider`, which sits above the router and so
 * cannot ask `useIsMobileShell` whether this page has tabs — and a toast that
 * appears one frame after the state it reports has already been missed.
 *
 * It pinned itself to `bottom-4` and therefore rendered *underneath* the tab
 * bar on every phone, which is not a subtle misalignment: the toast was
 * invisible. Four seconds later it was gone. Every confirmation this app has
 * ever shown on mobile — "Invoice uploaded", "Payment recorded", "Posted to
 * the ledger" — was never seen, and the app looked like it did nothing.
 */
export const MOBILE_TOAST_OFFSET =
  "max-[819px]:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]";

export const MOBILE_TAB_ROOTS = [
  "/",
  "/review",
  "/record",
  "/banking",
  "/more",
] as const;

export type MobileTabRoot = (typeof MOBILE_TAB_ROOTS)[number];

/** Banking hub + section tabs keep the bottom bar; account/statement drill-ins do not. */
function isMobileBankingShellRoot(path: string): boolean {
  if (
    path === "/banking" ||
    path === "/banking/transfers" ||
    path === "/banking/cash" ||
    path === "/banking/banks" ||
    path === "/banking/cards" ||
    path === "/banking/fx"
  ) {
    return true;
  }
  if (path.startsWith("/banking/accounts/")) return false;
  if (path.startsWith("/banking/statements/")) return false;
  if (/^\/banking\/fx\/[^/]+$/.test(path)) return false;
  return false;
}

export function normalizePathname(pathname: string): string {
  const base = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base || "/";
}

export function isMobileTabRoot(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if ((MOBILE_TAB_ROOTS as readonly string[]).includes(path)) return true;
  return isMobileBankingShellRoot(path);
}

/** Which bottom tab is active — includes drill-in pages under their section. */
export function activeMobileTab(pathname: string): MobileTabRoot {
  const path = normalizePathname(pathname);
  if ((MOBILE_TAB_ROOTS as readonly string[]).includes(path)) {
    return path as MobileTabRoot;
  }
  if (path.startsWith("/review")) return "/review";
  if (path.startsWith("/banking")) return "/banking";
  if (
    path.startsWith("/record") ||
    path === "/uploads" ||
    path === "/close-day"
  ) {
    return "/record";
  }
  return "/more";
}

export function mobileShellMediaQuery(): string {
  return `(max-width: ${MOBILE_SHELL_MAX_WIDTH_PX}px)`;
}

/** Resolve back navigation on mobile — avoids /review auto-redirect loops. */
export function mobileBackDestination(
  pathname: string,
  prev: string | null,
  staticBackHref: string | null,
): string {
  const prevPath = prev?.split("?")[0] ?? null;

  if (pathname.startsWith("/review/") && pathname !== "/review") {
    if (
      prevPath &&
      prevPath !== "/review" &&
      !prevPath.startsWith("/review/")
    ) {
      return prev!;
    }
    return "/";
  }

  if (staticBackHref) {
    if (
      prevPath &&
      prevPath !== staticBackHref &&
      !(prevPath === "/review" && pathname.startsWith("/review/"))
    ) {
      return prev!;
    }
    if (staticBackHref === "/review" && pathname.startsWith("/review/")) {
      return "/";
    }
    return staticBackHref;
  }

  if (prevPath) {
    if (prevPath === "/review" && pathname.startsWith("/review/")) return "/";
    return prev!;
  }

  return "/";
}
