import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The API caps list endpoints at MAX_LIST_LIMIT = 200 (app/core/listing/params.py,
 * `Query(..., le=MAX_LIST_LIMIT)`). Asking for more is not clamped — it fails
 * validation with a 422.
 *
 * Two screens asked for 500. Both wrapped the call in a catch that fell back to
 * an empty list, so the manual journal form showed an empty account picker and
 * the opening balance preview showed bare account codes, with no error either
 * place. Nothing failed loudly; the features just quietly did less.
 *
 * This walks the source rather than mocking fetch, because the bug was in the
 * URL string itself — a runtime test would have to guess which module to call.
 */
const SRC = new URL("..", import.meta.url).pathname;
const MAX_LIST_LIMIT = 200;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("list requests stay within the API's limit", () => {
  it("never asks a list endpoint for more than MAX_LIST_LIMIT", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/limit=(\d+)/g)) {
        const limit = Number(match[1]);
        if (limit > MAX_LIST_LIMIT) {
          offenders.push(`${file.replace(SRC, "")}: limit=${limit}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
