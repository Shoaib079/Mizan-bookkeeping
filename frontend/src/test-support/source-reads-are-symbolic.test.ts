/** No *new* test reads a frontend source file by path.
 *
 * D9: nine guards have failed because the code they check moved to another
 * file. Every fix was the same patch — point the path somewhere new — which
 * only ever set up the next one. `sourceDeclaring("RecordDesk")` survives a
 * move because it names the thing rather than its address.
 *
 * There are 250 such reads across 50-odd test files. Migrating all of them in
 * one go would be a large, unreviewable diff over the suite that has to stay
 * trustworthy while everything else changes — so this is a ratchet, the same
 * shape as `FILE_SIZE_BASELINE.json`. The listed files may keep their paths;
 * nothing may join them, and a file that leaves cannot come back.
 *
 * Nine have already moved across, including both that broke. The rest are
 * cheap to do whenever one is next opened for another reason.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFiles } from "@/test-support/source";

import baseline from "./path-reading-tests.json";

const SRC = join(__dirname, "..");

/** Reads that are legitimately a path, not a lapse.
 *
 * Backend files only. `sourceDeclaring` scans `src/`, so it cannot name a
 * Python module — and those guards exist precisely to compare the two sides,
 * so reaching across is the point.
 */
const ALLOWED = /backend\//;

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

/** Comments, which mention filenames without reading them.
 *
 * Three files counted as offenders purely because a docstring explained which
 * file the guard *used* to read. Prose about a move is exactly what should be
 * written down, so it must not be what keeps a file on this list.
 */
const COMMENTS = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm;

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
    expect(baseline.length).toBeGreaterThan(20);
  });

  it("no new test file reads source by path", () => {
    const joined = readsByPath().filter((path) => !baseline.includes(path));
    expect(
      joined,
      "These name a source file by path, so they break when it moves. Use " +
        'sourceDeclaring("TheSymbol") from @/test-support/source, or ' +
        "sourceAt(path) when the file has no unique export:\n  " +
        joined.join("\n  "),
    ).toEqual([]);
  });

  it("a file that stopped reading by path leaves the list", () => {
    // Otherwise the list only ever grows stale, forgiving files that no
    // longer need forgiving — and the count stops meaning anything.
    const current = readsByPath();
    const stale = baseline.filter((path) => !current.includes(path));
    expect(
      stale,
      "These no longer read source by path. Remove them from " +
        "path-reading-tests.json so the ratchet keeps tightening:\n  " +
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
