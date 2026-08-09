/** Every mutating `apiFetch` sends an Idempotency-Key.
 *
 * The API rejects POST/PUT/PATCH/DELETE without one when
 * `IDEMPOTENCY_ENFORCEMENT=true`, which is what production sets. A call that
 * forgets the header works perfectly in development — the local `.env` turns
 * enforcement off — and returns 400 the moment it is deployed.
 *
 * That is why this is a source scan rather than a runtime test. The failure
 * is invisible in every environment a developer runs, so nothing short of
 * reading the source catches it before a customer does.
 *
 * `AUDIT_MULTITENANCY.md` M3 found exactly one instance of this and called it
 * "the only mutation without one". By the time it was found again it was
 * eleven, and the symptom was a button that said "Idempotency-Key header
 * required". Hence a test rather than another fix.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/** Kept in step with `SKIP_PATH_SUFFIXES` in backend/app/core/idempotency/service.py.
 *
 * These are POSTs only because they carry a request body. They store nothing,
 * and a key would hand back a cached first answer — the opposite of what they
 * are for, since asking twice is how you get a second draft. */
const EXEMPT_PATH_FRAGMENTS = [
  "/statements/preview",
  "/detect-document-type",
  "/profit-allocation/preview",
  "/dishes/suggest-description",
  "/entries/actions",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(name)) return [];
    if (/\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

/** The text of an `apiFetch(...)` call, by matching brackets from its paren.
 *
 * A regex cannot do this: the options object contains nested braces, template
 * literals and arrow functions, and a non-greedy match to the first `)` stops
 * inside `JSON.stringify({...})`. */
function apiFetchCalls(source: string): { call: string; index: number }[] {
  const calls: { call: string; index: number }[] = [];
  const opener = /apiFetch\s*(?:<[^>]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let i = start;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push({ call: source.slice(start, i + 1), index: match.index });
  }
  return calls;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function urlOf(call: string): string {
  return /`([^`]*)`/.exec(call)?.[1] ?? "";
}

describe("idempotency coverage", () => {
  it("sends a key on every mutating apiFetch", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const { call, index } of apiFetchCalls(source)) {
        const mutates = MUTATION_METHODS.some((m) => call.includes(`"${m}"`));
        if (!mutates) continue;
        if (call.includes("idempotencyKey")) continue;
        const url = urlOf(call);
        if (EXEMPT_PATH_FRAGMENTS.some((fragment) => url.includes(fragment))) {
          continue;
        }
        offenders.push(
          `${file.replace(SRC, "src")}:${lineOf(source, index)} → ${url}`,
        );
      }
    }

    expect(
      offenders,
      "These mutations will return 400 in production, where " +
        "IDEMPOTENCY_ENFORCEMENT is true. Pass `idempotencyKey: " +
        "newIdempotencyKey()` (one-shot actions) or " +
        "`submitIdempotency.beginSubmit()` (forms):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("finds the mutating calls it claims to check", () => {
    // Without this, a bug in the scanner — a changed call style, a bad
    // regex — makes the test above pass by finding nothing at all.
    const total = sourceFiles(SRC)
      .flatMap((file) => apiFetchCalls(readFileSync(file, "utf8")))
      .filter(({ call }) =>
        MUTATION_METHODS.some((m) => call.includes(`"${m}"`)),
      );
    expect(total.length).toBeGreaterThan(20);
  });
});
