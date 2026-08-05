import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** A placeholder that reads as a value makes an empty form look filled in.
 *
 * The group sale dialog showed "10" for pax and "12,00" for the rate, in the
 * same position and format a real entry takes — so a blank form looked
 * complete, and the "—" total beside it looked like a bug rather than the
 * correct answer for nothing entered.
 *
 * "0" and "0,00" are exempt: they read as an empty amount, which is what they
 * are.
 */

const SRC = new URL("../..", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

describe("numeric placeholders read as examples", () => {
  it("no placeholder looks like a real entry", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/placeholder=(?:"|\{[^}]*")([0-9][0-9.,]*)"/g)) {
        const value = match[1];
        if (/^0([.,]0+)?$/.test(value)) continue; // an empty amount, fine
        offenders.push(`${file.replace(SRC, "")}: "${value}"`);
      }
    }
    expect(
      offenders,
      `These look like values rather than examples — prefix with "e.g. ":\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
