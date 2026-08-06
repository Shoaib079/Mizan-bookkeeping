import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DESKTOP_CHROME_ONLY, MOBILE_SHELL_MAX_WIDTH_PX } from "@/lib/mobile-shell";

/** The desktop shell must not paint on a phone, even for one frame.
 *
 * `useIsMobileShell` returns false until an effect runs, because matchMedia
 * does not exist during render on the server. So AppShell's `if (isMobile)`
 * branch takes the desktop path first, paints the sidebar — logo, wordmark,
 * nav — and only then swaps to the mobile shell. On a phone that reads as the
 * logo appearing and vanishing on every load, and the slower the connection
 * the longer it lingers.
 *
 * A JS branch cannot fix this; it is the wrong tool for a question CSS
 * already answers at parse time. The desktop chrome carries a media query so
 * a narrow viewport never shows it, whatever the JS believes.
 *
 * `mobile-touch-targets.test.ts` guards the same principle for control sizes.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the desktop shell is hidden below the breakpoint by CSS", () => {
  const shell = read("./app-shell.tsx");

  it("the sidebar carries the media query", () => {
    const aside = shell.match(/<aside[\s\S]*?>/)?.[0];
    expect(aside, "no <aside> — did the shell get restructured?").toBeTruthy();
    expect(
      aside,
      "the sidebar will flash on every mobile load before hydration",
    ).toContain("DESKTOP_CHROME_ONLY");
  });

  it("the desktop header carries it too", () => {
    const header = shell.match(/<header[\s\S]*?>/)?.[0];
    expect(header, "no desktop <header> found").toBeTruthy();
    expect(header).toContain("DESKTOP_CHROME_ONLY");
  });

  it("the class is a literal Tailwind can see, at the shared breakpoint", () => {
    // Tailwind scans for complete class strings; a class assembled by
    // interpolation generates no CSS and fails silently, which looks exactly
    // like the bug it was meant to fix.
    expect(DESKTOP_CHROME_ONLY).toBe(`max-[${MOBILE_SHELL_MAX_WIDTH_PX}px]:hidden`);
  });
});

describe("the mark is reachable on a phone", () => {
  it("the mobile top bar renders the logo", () => {
    const bar = read("./mobile-top-bar.tsx");
    expect(
      bar,
      "mobile has no logo anywhere — the sidebar is desktop-only",
    ).toMatch(/<Logo\b/);
  });

  it("it is marked decorative, since the bar already announces the page", () => {
    const bar = read("./mobile-top-bar.tsx");
    const logo = bar.match(/<Logo\b[^/]*\/>/)?.[0];
    expect(logo, "<Logo> not found in the mobile bar").toBeTruthy();
    expect(logo).toContain("decorative");
  });

  it("the sidebar logo stays announced — it is the identity there", () => {
    const shell = read("./app-shell.tsx");
    const logo = shell.match(/<Logo\b[^/]*\/>/)?.[0];
    expect(logo, "<Logo> not found in the sidebar").toBeTruthy();
    expect(logo).not.toContain("decorative");
  });
});
