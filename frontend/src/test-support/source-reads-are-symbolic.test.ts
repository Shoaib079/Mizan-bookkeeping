/** No test reads a frontend source file by path.
 *
 * D9: nine guards had failed because the code they check moved to another
 * file. Every fix was the same patch — point the path somewhere new — which
 * only ever set up the next one. `sourceDeclaring("RecordDesk")` survives a
 * move because it names the thing rather than its address.
 *
 * This began as a ratchet over 32 files and 250 reads, because migrating them
 * in one go would have been a large, unreviewable diff across the suite that
 * has to stay trustworthy while everything else changes. They were done by
 * hand, a file at a time. Thirty-one crossed; the list is gone, and what is
 * left is a rule with one stated exception.
 *
 * Two things surfaced on the way across, neither of them findable by reading
 * any one file: `InvoicesReviewPanel` and `ReceiptsReviewPanel` were each
 * declared twice, because the `dynamic()` wrapper on the page shadowed the
 * panel it wrapped. Four of those were renamed to `Lazy*` last time; these two
 * survived because no guard happened to name them. Naming things is what found
 * them.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFiles } from "@/test-support/source";

const SRC = join(__dirname, "..");

/** Reads that are legitimately a path, not a lapse.
 *
 * Backend files only. `sourceDeclaring` scans `src/`, so it cannot name a
 * Python module — and those guards exist precisely to compare the two sides,
 * so reaching across is the point.
 */
const ALLOWED = /backend\//;

/** The one frontend test that may still name a file, and why.
 *
 * A mapping rather than a list so the reason travels with the name. The same
 * shape as `NOT_POSTED` and `ALLOWED_OWN_DROPDOWN` — twice now an exclusion
 * written as a bare list has turned out to be hiding something, because a
 * deliberate exception and an oversight look identical without the sentence.
 */
const MAY_READ_BY_PATH: Record<string, string> = {
  "lib/archetype-coverage.test.ts":
    "it walks app/ to discover every route, so the file's location is the " +
    "data — a route in Next.js *is* its path. Naming the pages by symbol " +
    "would mean listing the very thing it exists to enumerate, and a page " +
    "added without being listed is the failure it catches",
};

/** Comments, which mention filenames without reading them.
 *
 * Three files counted as offenders purely because a docstring explained which
 * file the guard *used* to read. Prose about a move is exactly what should be
 * written down, so it must not be what keeps a file on this list.
 */
const COMMENTS = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm;

function testFiles(): { path: string; text: string }[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.test\.tsx?$/.test(name) ? [path] : [];
    });
  return walk(SRC).map((path) => ({
    path: path.slice(SRC.length + 1).split("\\").join("/"),
    text: readFileSync(path, "utf8"),
  }));
}

/** Test files that still name a `.ts`/`.tsx` source file by path. */
function readsByPath(): string[] {
  const found: string[] = [];
  for (const file of testFiles()) {
    if (file.path.startsWith("test-support/")) continue;
    if (!/readFileSync|new URL/.test(file.text)) continue;
    const code = file.text.replace(COMMENTS, "");
    const names = [...code.matchAll(/["'`]([\w./[\]()@-]+\.tsx?)["'`]/g)]
      .map((m) => m[1]!)
      // An import specifier is a module path, not a file read.
      .filter((literal) => !literal.startsWith("@/") && !ALLOWED.test(literal));
    if (names.length > 0) found.push(file.path);
  }
  return found.sort();
}

describe("guards locate code by symbol", () => {
  it("finds the test files and the source tree", () => {
    // Over an empty list every assertion below is vacuous.
    expect(testFiles().length).toBeGreaterThan(100);
    expect(sourceFiles().length).toBeGreaterThan(400);
  });

  it("no test file reads source by path", () => {
    const offenders = readsByPath().filter(
      (path) => !(path in MAY_READ_BY_PATH),
    );
    expect(
      offenders,
      "These name a source file by path, so they break when it moves. Use " +
        'sourceDeclaring("TheSymbol") from @/test-support/source, or ' +
        "sourceAt(path) when the file has no unique export:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the exception still reads by path", () => {
    // An exception for a file that no longer needs one forgives nothing and
    // quietly makes the rule cover less than it claims.
    const current = readsByPath();
    const stale = Object.keys(MAY_READ_BY_PATH).filter(
      (path) => !current.includes(path),
    );
    expect(
      stale,
      "These no longer read source by path. Remove them from " +
        "MAY_READ_BY_PATH so the rule covers everything again:\n  " +
        stale.join("\n  "),
    ).toEqual([]);
  });

  it("still allows reaching into the backend deliberately", () => {
    // Otherwise the rule would push the contract guards to delete themselves,
    // and those are among the few that have caught real drift.
    expect(ALLOWED.test("../../backend/app/core/x.py")).toBe(true);
    expect(ALLOWED.test("components/record/record-desk.tsx")).toBe(false);
  });
});
