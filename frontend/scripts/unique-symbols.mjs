/** Which symbols in a source file `sourceDeclaring()` can actually find.
 *
 * Migrating a guard off a path means choosing a name for the file it used to
 * read. Guessing the name is how the last two attempts went wrong: a symbol
 * that two files declare throws, and one that none declares throws differently,
 * and both look like the guard broke.
 *
 * So this asks the question with *the same rules* `test-support/source.ts`
 * uses — the regexes below are copied from it, not reimplemented. A checker
 * that approximates the thing it checks is the mistake this whole exercise is
 * about.
 *
 *   node scripts/unique-symbols.mjs components/layout/app-shell.tsx [...]
 *
 * With no arguments it prints every source file that declares nothing unique,
 * which is the set no guard can name.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "test-support") return [];
    if (statSync(path).isDirectory()) return walk(path);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

const IMPORT_OR_REEXPORT =
  /^[ \t]*(?:import|export)\b[^;]*?\bfrom[ \t]*["'][^"']*["'];?/gm;
const COMMENTS = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm;

const DECLARATION =
  /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;

const files = walk(SRC).map((path) => ({
  path: relative(SRC, path),
  code: readFileSync(path, "utf8")
    .replace(COMMENTS, "")
    .replace(IMPORT_OR_REEXPORT, ""),
}));

/** name -> files declaring it, by the same predicate `declares()` uses. */
const owners = new Map();
for (const file of files) {
  for (const [, name] of file.code.matchAll(DECLARATION)) {
    if (!owners.has(name)) owners.set(name, new Set());
    owners.get(name).add(file.path);
  }
}

const asked = process.argv.slice(2);

if (asked.length === 0) {
  const orphans = files.filter(
    (f) =>
      ![...f.code.matchAll(DECLARATION)].some(
        ([, n]) => owners.get(n).size === 1,
      ),
  );
  console.log(`${orphans.length} files declare nothing unique:`);
  for (const f of orphans) console.log("  " + f.path);
} else {
  for (const want of asked) {
    const file = files.find((f) => f.path === want);
    if (!file) {
      console.log(`${want}\n  NOT FOUND under src/`);
      continue;
    }
    const names = [...new Set([...file.code.matchAll(DECLARATION)].map((m) => m[1]))];
    const unique = names.filter((n) => owners.get(n).size === 1);
    const shared = names.filter((n) => owners.get(n).size > 1);
    console.log(want);
    console.log("  unique: " + (unique.join(", ") || "(none — use sourceAt)"));
    if (shared.length) {
      console.log(
        "  shared: " +
          shared
            .map((n) => `${n}(${[...owners.get(n)].length})`)
            .join(", "),
      );
    }
  }
}
