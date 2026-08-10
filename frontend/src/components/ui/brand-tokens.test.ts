import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** The brand is not the UI colour, and must not quietly become it again.
 *
 * --primary is a role: "this is the thing to press". The brand is an identity.
 * They move for unrelated reasons — a rebrand should not restyle 280 buttons,
 * and choosing a new button colour should not repaint the logo. The wordmark
 * used to be `text-primary`, which welded the two together; the point of
 * splitting them is that either can change alone, and that only holds if
 * nothing reconnects them.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/** Source with comments removed.
 *
 * The rule below is about what the code paints with, so it has to be asked of
 * the code. Asking it of the whole file failed on the logo's own doc comment,
 * which names the token it is explaining the avoidance of — and the fix for
 * that is not to write more careful prose, it is to stop treating prose as
 * code. */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const CSS = read("../../app/globals.css");

/** Pull a custom property's value out of a specific block of globals.css. */
function token(block: ":root" | ".dark", name: string): string | null {
  const body = CSS.split(block === ":root" ? ":root {" : ".dark {")[1];
  if (!body) return null;
  return body.split("}")[0].match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? null;
}

describe("brand tokens exist in both themes", () => {
  it.each(["brand-ink", "brand-1", "brand-2", "brand-3"])(
    "--%s is defined for light and dark",
    (name) => {
      expect(token(":root", name), `${name} missing from :root`).toBeTruthy();
      expect(token(".dark", name), `${name} missing from .dark`).toBeTruthy();
    },
  );

  it("the wordmark colour differs between themes", () => {
    // Espresso ink on a navy background is unreadable. If someone adds
    // --brand-ink to :root and forgets .dark, this catches it.
    expect(token(".dark", "brand-ink")).not.toBe(token(":root", "brand-ink"));
  });
});

describe("the brand is not wired to the UI colour", () => {
  it("the logo paints from --brand-*, never --primary", () => {
    const logo = codeOnly(sourceDeclaring("Logo"));
    expect(logo).toContain("var(--brand-1)");
    expect(logo).toContain("var(--brand-2)");
    expect(logo).toContain("var(--brand-3)");
    expect(logo, "the logo is following the button colour again").not.toMatch(
      /--primary|bg-primary|text-primary/,
    );
  });

  it("the sidebar wordmark uses the brand ink", () => {
    const shell = sourceDeclaring("AppShell");
    const wordmark = shell.match(/<p className="[^"]*">\s*Mizan\s*<\/p>/)?.[0];
    expect(wordmark, "the sidebar wordmark moved or was renamed").toBeTruthy();
    expect(wordmark).toContain("text-brand-ink");
    expect(wordmark).not.toContain("text-primary");
  });
});

describe("the favicon tracks the brand", () => {
  /** icon.svg cannot use var(--brand-*) — a favicon is fetched as its own
   * document and never sees the page stylesheet, so a variable resolves to
   * nothing and the icon renders blank. That forces a copy of the hexes, and
   * a copy with no test is a copy that goes stale. */
  it("its hexes match the light-theme brand tokens", () => {
    const icon = read("../../app/icon.svg");
    for (const name of ["brand-1", "brand-2", "brand-3"] as const) {
      const hex = token(":root", name);
      expect(hex, `${name} missing`).toBeTruthy();
      expect(
        icon.toLowerCase(),
        `icon.svg has drifted from --${name} (${hex}) in globals.css`,
      ).toContain(hex!.toLowerCase());
    }
  });
});
