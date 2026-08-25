/**
 * Components and lib helpers must paint from CSS variables (globals.css),
 * never from raw hex. Hex belongs only in the token file (and PWA/favicon
 * surfaces that cannot see the stylesheet).
 *
 * Adapted from the owner starter — scans for any #RGB hex, not a fixed list.
 */

import { describe, expect, it } from "vitest";

import { codeOnly, sourceFiles } from "@/test-support/source";

/** Hex colour literals (3–8 digit). */
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Hex is allowed only where the design system (or the platform) requires it. */
const ALLOWED_HEX_PATHS = new Set([
  "app/globals.css",
  "app/icon.svg",
  "app/manifest.ts",
]);

describe("no hardcoded colors", () => {
  it("no component or lib helper embeds hex — use CSS variables from globals.css", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      if (ALLOWED_HEX_PATHS.has(file.path)) continue;
      // Preview kit is display-only mock UI, not product chrome.
      if (file.path.startsWith("components/preview/")) continue;

      const code = codeOnly(file.text);
      const hits = code.match(HEX);
      if (!hits?.length) continue;
      for (const hex of [...new Set(hits)]) {
        offenders.push(`${file.path}: ${hex}`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
