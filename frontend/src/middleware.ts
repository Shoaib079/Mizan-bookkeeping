/** Clerk route protection — skipped when publishable key is unset (local dev). */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/** Origins allowed to present a session to this app.
 *
 * Clerk calls the absence of this a CSRF exposure. Its Frontend API accepts
 * requests from any subdomain of the configured root domain, so if anything
 * else on that domain is compromised it can mint sessions this app would
 * accept. The allowlist closes that.
 *
 * Read from the environment rather than hardcoded because it is the
 * production domain, which does not exist yet — Clerk production requires a
 * domain you own and can add DNS records to. Until CLERK_AUTHORIZED_PARTIES
 * is set, this stays undefined and Clerk behaves exactly as before; the day
 * the domain is bought, it is one variable rather than a code change.
 *
 * Comma-separated, e.g. "https://app.example.com,https://example.com".
 */
const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export default clerkMiddleware(
  async (auth, request) => {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      return NextResponse.next();
    }
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
  // Passing an empty list would allow nothing and lock everyone out, so an
  // unset variable must mean "no opinion", not "no one".
  authorizedParties && authorizedParties.length > 0
    ? { authorizedParties }
    : undefined,
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
