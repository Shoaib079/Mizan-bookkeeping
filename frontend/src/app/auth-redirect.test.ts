import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Sign-in has to land somewhere inside the app.
 *
 * Clerk's <SignIn> with no redirect target does not fail. It authenticates,
 * then sends the user to the Home URL set in the Clerk dashboard — and when
 * that is unset it is Clerk's own "you're signed in, now connect Clerk to
 * your application" placeholder. So the user signs in successfully and never
 * reaches the product, which reads as "the app logged me out" rather than as
 * a missing prop.
 *
 * Nothing in a build or a type check catches that: the prop is optional, the
 * page renders, and the failure only exists at runtime on a deployed domain
 * whose dashboard config nobody has looked at.
 */

const PAGES = [
  { name: "sign-in", symbol: "SignInPage", tag: "SignIn" },
  { name: "sign-up", symbol: "SignUpPage", tag: "SignUp" },
];

/** Source with comments stripped — the rule is about the JSX, and the prose
 * explaining the rule necessarily contains the words it forbids. */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe.each(PAGES)("$name sends the user into the app", ({ symbol, tag }) => {
  const element = () => {
    const source = codeOnly(sourceDeclaring(symbol));
    // (?![A-Za-z]) or this matches <SignInReasonBanner />, which sits on the
    // same page, has no redirect props, and would fail for the wrong reason.
    const match = source.match(new RegExp(`<${tag}(?![A-Za-z])[\\s\\S]*?/>`));
    expect(match, `<${tag}> not found — did the page move?`).toBeTruthy();
    return match![0];
  };

  it("names a redirect target", () => {
    expect(
      element(),
      `<${tag}> has no redirect target, so Clerk will strand the user on its own page`,
    ).toMatch(/fallbackRedirectUrl=|forceRedirectUrl=/);
  });

  it("uses fallback rather than force, so deep links survive", () => {
    // The middleware appends redirect_url when it intercepts a protected
    // page. forceRedirectUrl overrides that, which would silently throw away
    // where the user was actually trying to go.
    expect(element()).not.toContain("forceRedirectUrl=");
  });

  it("points at an in-app path, not an absolute URL", () => {
    const target = element().match(/fallbackRedirectUrl="([^"]*)"/)?.[1];
    expect(target, "redirect target is not a literal string").toBeTruthy();
    expect(target!.startsWith("/"), `"${target}" is not an app path`).toBe(true);
  });
});
