/** Every `sourceDeclaring("X")` in the suite resolves to exactly one file.
 *
 * `tsc` cannot see this: the argument is a string, and a name that no file
 * declares — or that two do — throws only when the test runs. Migrating guards
 * off paths turns a compile-time-ish mistake into a runtime one, so the
 * migration needs a check of its own.
 *
 * The predicate below is copied from `test-support/source.ts` rather than
 * approximated. Five times this session a check has used a slightly different
 * rule than the thing it checked and passed while the bug sat in front of it.
 *
 *   node scripts/check-symbol-guards.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function walk(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, keep);
    return keep(name) ? [path] : [];
  });
}

// --- copied verbatim from test-support/source.ts -------------------------
const IMPORT_OR_REEXPORT =
  /^[ \t]*(?:import|export)\b[^;]*?\bfrom[ \t]*["'][^"']*["'];?/gm;
const COMMENTS = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm;

function declares(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = text.replace(COMMENTS, "").replace(IMPORT_OR_REEXPORT, "");
  return new RegExp(
    `(?:export\\s+)?(?:default\\s+)?` +
      `(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${escaped}\\b`,
  ).test(code);
}
// ------------------------------------------------------------------------

const sources = walk(
  SRC,
  (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n),
)
  .filter((p) => !relative(SRC, p).startsWith("test-support"))
  .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }));

// `test-support/`'s own tests name symbols that deliberately do not resolve —
// "ThisWasRenamedLastYear" and "Props" are how they prove the helper throws on
// none and on many. Excluded for the same reason `source.ts` excludes the
// directory from its own walk.
const tests = walk(SRC, (n) => /\.test\.tsx?$/.test(n)).filter(
  (p) => !relative(SRC, p).startsWith("test-support"),
);

let bad = 0;
let checked = 0;

/** Arrays of bare PascalCase strings — `for (const page of [...])` feeding
 *  `sourceDeclaring(page)`.
 *
 * Added because the first version of this only read literal arguments, and
 * `archetypes.test.ts` passes forty-eight symbols through a loop variable. It
 * reported "0 unresolved" over a file where it had checked nothing, which is
 * the failure this whole script exists to prevent. */
const LOOPED_ARRAY = /\[\s*((?:\s*"[A-Z][A-Za-z0-9]*",?\s*)+)\]/g;

for (const test of tests) {
  const text = readFileSync(test, "utf8").replace(COMMENTS, "");
  const names = [
    ...[...text.matchAll(/sourceDeclaring(?:All)?\(([^)]*)\)/g)].flatMap((m) =>
      [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((q) => q[1]),
    ),
    // Only when the file resolves symbols at all — otherwise every array of
    // capitalised strings in the suite would be treated as one.
    ...(/sourceDeclaring\(\w+\)/.test(text)
      ? [...text.matchAll(LOOPED_ARRAY)].flatMap((m) =>
          [...m[1].matchAll(/"([A-Z][A-Za-z0-9]*)"/g)].map((q) => q[1]),
        )
      : []),
  ];

  for (const name of new Set(names)) {
    checked += 1;
    const owners = sources.filter((f) => declares(f.text, name));
    if (owners.length === 1) continue;
    bad += 1;
    console.log(
      `${relative(SRC, test)}\n  sourceDeclaring("${name}") -> ${owners.length} files` +
        (owners.length ? ": " + owners.map((o) => o.path).join(", ") : ""),
    );
  }
}

// A pass over zero call sites proves nothing.
if (checked === 0) {
  console.log("no sourceDeclaring() calls found — the scan is broken");
  process.exit(1);
}

console.log(`${checked} symbol${checked === 1 ? "" : "s"} checked, ${bad} unresolved`);
process.exit(bad === 0 ? 0 : 1);
