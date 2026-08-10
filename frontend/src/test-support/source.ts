import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** Finding source to assert on, without pinning to where it currently lives.
 *
 * A large number of guards in this project read a source file by path and
 * check it contains something. They work, and they have failed nine times for
 * a reason that had nothing to do with what they guard: the code moved to
 * another file. `gl-edit-kinds.test.ts` when the edit switch left
 * `gl-entry-actions.tsx`; `add-page-simplify-guard.test.ts` when `role="tab"`
 * left `record-desk.tsx`. Each cost the same minute of believing something
 * real had broken, and each fix was the same patch — point the path somewhere
 * new — which sets up the tenth.
 *
 * The mistake is in what they name. A guard that says "`role="tab"` is in
 * record-desk.tsx" is asserting two things and only means one. It means the
 * Record desk renders tabs. Where that line sits is an implementation detail
 * the guard should not have an opinion about.
 *
 * So: name the symbol, or search the tree.
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // Not test infrastructure. This file's own comments name several app
    // symbols, and it found itself as a second declaration of one of them.
    if (name === "test-support") return [];
    if (statSync(path).isDirectory()) return walk(path);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

let cache: { path: string; text: string }[] | null = null;

/** Every non-test source file under `src`, read once per run. */
export function sourceFiles(): { path: string; text: string }[] {
  cache ??= walk(SRC).map((path) => ({
    path: relative(SRC, path),
    text: readFileSync(path, "utf8"),
  }));
  return cache;
}

/** Import and re-export statements, which name symbols without defining them.
 *
 * `import { type GlEditTarget } from "…"` reads exactly like a declaration to
 * a regex, so three files "declared" a type that exists in one. Stripped
 * before matching rather than excluded per-pattern, because the same trap
 * catches `import { foo }`, `export type { Bar } from`, and every future
 * variant of naming something you did not write.
 */
// `[^;]` already spans newlines, so the `s` flag is unnecessary — and it
// needs an es2018 target this tsconfig does not set.
const IMPORT_OR_REEXPORT = /^[ \t]*(?:import|export)\b[^;]*?\bfrom[ \t]*["'][^"']*["'];?/gm;

/** Comments, which describe declarations without being any.
 *
 * A docstring saying "`editTargetFor` returns…" is prose. Line comments are
 * only stripped at the start of a line so that a `//` inside a URL in a string
 * literal is left alone.
 */
const COMMENTS = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm;

/** Patterns that mean "this file is where `name` is defined". */
function declares(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = text.replace(COMMENTS, "").replace(IMPORT_OR_REEXPORT, "");
  return new RegExp(
    `(?:export\\s+)?(?:default\\s+)?` +
      `(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${escaped}\\b`,
  ).test(code);
}

/** The source of whichever file declares `name`.
 *
 * Throws when nothing declares it, and when more than one does — an ambiguous
 * answer is worse than none, because the assertion would silently apply to
 * whichever happened to be first.
 */
export function sourceDeclaring(name: string): string {
  const matches = sourceFiles().filter((file) => declares(file.text, name));
  if (matches.length === 0) {
    throw new Error(
      `No file under src/ declares ${name}. It was renamed or removed — ` +
        `this guard is asserting about something that no longer exists.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} files declare ${name}: ` +
        matches.map((m) => m.path).join(", ") +
        `. Rename one, or read it by path deliberately.`,
    );
  }
  return matches[0]!.text;
}

/** Where `name` is declared — for a message, or to assert it moved somewhere. */
export function fileDeclaring(name: string): string {
  const matches = sourceFiles().filter((file) => declares(file.text, name));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one declaration of ${name}, found ${matches.length}`);
  }
  return matches[0]!.path;
}

/** The source of every file declaring one of `names`, joined.
 *
 * For a feature that is spread across a few files on purpose — the Record
 * desk is its panel plus its buttons — where the assertion is about the
 * feature and should not care how it is divided.
 */
export function sourceDeclaringAll(...names: string[]): string {
  const paths = new Set<string>();
  const texts: string[] = [];
  for (const name of names) {
    const path = fileDeclaring(name);
    if (paths.has(path)) continue;
    paths.add(path);
    texts.push(sourceDeclaring(name));
  }
  return texts.join("\n");
}

/** Read a specific file, failing with its path rather than by finding nothing.
 *
 * For the cases a symbol cannot name: a Next.js page whose only export is
 * `default function Page`, or a file in the backend. `readFileSync` already
 * throws on a missing path — this exists so the intent is explicit and so
 * `no-bare-readfilesync.test.ts` can tell a deliberate path from a habit.
 */
export function sourceAt(relativePath: string): string {
  try {
    return readFileSync(join(SRC, relativePath), "utf8");
  } catch {
    throw new Error(
      `Cannot read src/${relativePath}. If it moved, prefer sourceDeclaring() ` +
        `so the next move does not break this guard.`,
    );
  }
}

/** Does any source file contain this text? For "somewhere, we do X". */
export function codeContains(needle: string): boolean {
  return sourceFiles().some((file) => file.text.includes(needle));
}

/** Which files contain it — for a failure message worth reading. */
export function filesContaining(needle: string): string[] {
  return sourceFiles()
    .filter((file) => file.text.includes(needle))
    .map((file) => file.path);
}
