/** No skeleton is drawn straight from a page's `loading` flag, anywhere.
 *
 * The archetype guard in `components/page/archetypes.test.ts` covers the five
 * shared frames. It did not cover the twelve pages and panels that skip those
 * frames and render `<PageSkeleton />` themselves — which is why the dashboard
 * still blinked after the archetypes were fixed, and why the owner had to
 * report it a second time.
 *
 * A check scoped to the files I happened to have open is the fault this
 * project keeps repeating. So this reads every component in the tree.
 *
 * The rule: a page sets `loading` on every fetch, including the background
 * ones React Query fires on window focus and the ledger-changed event fires
 * after a post. Gating a skeleton on it collapses the page and springs it back
 * each time. `useShowsSkeleton` draws it only until the first load finishes.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
    out.push(path);
  }
  return out;
}

/** `{loading && <PageSkeleton` and `{loading ? (\n <PageSkeleton`, the two
 * shapes that existed. Whitespace-tolerant so reformatting does not disarm it. */
const RAW_GATE = /\{\s*loading\s*(?:&&|\?)[\s\S]{0,60}?<(?:Page)?Skeleton/;

/** Comments are prose, not code. `skeleton.tsx` documents the wrong shape in
 * order to warn against it, and matching that would make the guard report the
 * one file that fixes the problem. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("skeletons", () => {
  const files = sourceFiles(SRC);

  it("finds the source tree", () => {
    // Guard the guard: over an empty list every assertion below is vacuous,
    // which is exactly how the archetype check missed seven other files.
    expect(files.length).toBeGreaterThan(200);
    expect(
      files.filter((f) => readFileSync(f, "utf8").includes("Skeleton")).length,
    ).toBeGreaterThan(10);
  });

  it("are never drawn straight from a loading flag", () => {
    const offenders = files.filter((f) =>
      RAW_GATE.test(codeOnly(readFileSync(f, "utf8"))),
    );
    expect(
      offenders.map((f) => f.slice(SRC.length + 1)),
      "these blank the page on every background refresh — use useShowsSkeleton",
    ).toEqual([]);
  });

  it("still draws them somewhere, through the rule", () => {
    // The other direction: deleting every skeleton would satisfy the rule
    // above and leave first loads showing nothing at all.
    //
    // Two shapes, both correct. The archetypes hold the flag themselves,
    // because they pick between the skeleton and the content; everywhere else
    // hands it to `<PageSkeleton when={...} />` and the component decides.
    const users = files.filter((f) => {
      const source = codeOnly(readFileSync(f, "utf8"));
      return (
        source.includes("useShowsSkeleton(loading)") ||
        /<PageSkeleton\s+when=\{loading\}/.test(source)
      );
    });
    expect(users.length).toBeGreaterThanOrEqual(10);
  });
});
