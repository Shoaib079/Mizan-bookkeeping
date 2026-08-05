import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** `ListPage` renders `{isMobile && mobile ? mobile : table}`, so a page that
 * omits the `mobile` slot silently serves a desktop table to a phone. Nine of
 * fourteen call sites omitted it, which is how 45 of the app's 50 table
 * surfaces ended up with no phone view — the exact drift DESIGN_ARCHETYPES was
 * written to prevent. An archetype cannot enforce what it lets you leave out.
 *
 * All fourteen now pass one. A new `ListPage` without a `mobile` slot fails
 * here rather than quietly serving a table to a phone.
 *
 * Read from source rather than rendered, because the question is which call
 * sites pass a prop — a render test would have to mount all fourteen.
 */

const SRC = new URL("../..", import.meta.url).pathname;

/** Call sites still owing a mobile view. Remove entries; never add one. */
/** Empty, and meant to stay that way. Every ListPage now ships a phone view;
 * an entry here would mean one shipped without. */
const AWAITING_MOBILE_VIEW: string[] = [];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

function listPageCallSitesWithoutMobile(): string[] {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("<ListPage")) continue;
    if (source.includes("mobile={")) continue;
    offenders.push(file.replace(SRC, ""));
  }
  return offenders.sort();
}

describe("ListPage mobile coverage", () => {
  it("no new list page ships without a phone view", () => {
    const offenders = listPageCallSitesWithoutMobile();
    const unexpected = offenders.filter(
      (file) => !AWAITING_MOBILE_VIEW.includes(file),
    );
    expect(
      unexpected,
      `These pass a table to ListPage with no mobile view:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });

  it("the allowlist has no stale entries", () => {
    // A page that gained its mobile view must leave the list, or the list
    // stops describing anything and quietly permits a regression.
    const offenders = listPageCallSitesWithoutMobile();
    const fixed = AWAITING_MOBILE_VIEW.filter(
      (file) => !offenders.includes(file),
    );
    expect(
      fixed,
      `These now have a mobile view — remove them from AWAITING_MOBILE_VIEW:\n${fixed.join("\n")}`,
    ).toEqual([]);
  });
});
