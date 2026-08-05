import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** `overflow-auto` around a `w-full` table does not scroll. The table fits
 * itself to the container, compresses every column, wraps each cell into a
 * tall stack, and pushes the trailing columns off the edge where they cannot
 * be reached — on a phone the supplier ledger's NET column was simply not
 * visible, and the invoice list ended after the counterparty.
 *
 * `wide` gives the overflow something to scroll and pins the first column so
 * the date stays in view. Any table with six or more columns needs it; below
 * that, fitting the width is better than making the reader swipe.
 */

const SRC = new URL("../..", import.meta.url).pathname;
const COLUMNS_THAT_FIT_A_PHONE = 5;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

describe("DataTable wide mode", () => {
  it("gives the overflow a minimum width to scroll", () => {
    const source = readFileSync(
      new URL("./data-table.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-w-[46rem]");
    // Without a min-width the container has nothing to scroll and the columns
    // compress instead — the bug this mode exists to fix.
    expect(source).toMatch(/wide && \[/);
  });

  it("pins the first column so it survives the scroll", () => {
    const source = readFileSync(
      new URL("./data-table.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("[&_td:first-child]:sticky");
    expect(source).toContain("[&_td:first-child]:left-0");
    // A transparent sticky cell shows the scrolling rows through it.
    expect(source).toContain("[&_td:first-child]:bg-card");
  });

  it("every table too wide for a phone opts in", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      const columns = (source.match(/<DataTableHeaderCell/g) ?? []).length;
      if (columns <= COLUMNS_THAT_FIT_A_PHONE) continue;
      // A file can hold more than one table; only flag plain, unmarked ones.
      if (source.includes("<DataTable>")) {
        offenders.push(`${file.replace(SRC, "")} (${columns} columns)`);
      }
    }
    expect(
      offenders,
      `These have more columns than a phone can show and will clip:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
