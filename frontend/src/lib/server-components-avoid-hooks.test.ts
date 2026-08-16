/** Nothing a server component renders calls a hook without a client boundary.
 *
 * `PageSkeleton` gained a hook so it could decide whether to draw itself, and
 * `skeleton.tsx` had no `"use client"`. Seventeen server components render a
 * skeleton — every route-level `loading.tsx`, plus `not-found` — so the build
 * failed at prerender with "Attempted to call useShowsSkeleton() from the
 * server". Nothing caught it: `tsc` is happy, eslint is happy, and the whole
 * test suite passed. Only `next build` knew, and only on Vercel.
 *
 * A module without `"use client"` is not automatically a server module — it is
 * whatever its importers are. `money-input.tsx` calls hooks with no boundary
 * of its own and is fine, because only client components import it. So the
 * rule cannot be "hooks require the directive"; it has to be "hooks require it
 * *if a server component can reach you*", which is what this walks.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const HOOK_CALL = /\buse[A-Z]\w*\s*\(/;

function allFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...allFiles(path));
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(path);
  }
  return out;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function isClient(path: string): boolean {
  return read(path).trimStart().startsWith('"use client"');
}

/** Local `@/…` and relative imports, resolved to files that exist. */
function localImports(path: string): string[] {
  const source = read(path);
  const out: string[] = [];
  for (const [, spec] of source.matchAll(/from\s+"([^"]+)"/g)) {
    const base = spec.startsWith("@/")
      ? join(SRC, spec.slice(2))
      : spec.startsWith(".")
        ? resolve(dirname(path), spec)
        : null;
    if (!base) continue;
    for (const candidate of [
      `${base}.tsx`,
      `${base}.ts`,
      join(base, "index.tsx"),
      join(base, "index.ts"),
    ]) {
      try {
        if (statSync(candidate).isFile()) {
          out.push(candidate);
          break;
        }
      } catch {
        // not this extension
      }
    }
  }
  return out;
}

/** Modules a server component pulls in, stopping at each client boundary —
 * past one, React is running on the client and hooks are allowed. */
function serverReachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path) || isClient(path)) continue;
    seen.add(path);
    queue.push(...localImports(path));
  }
  return seen;
}

describe("server components", () => {
  const routes = allFiles(join(SRC, "app")).filter(
    (f) => /\/(page|layout|loading|not-found|error|global-error)\.tsx$/.test(f) && !isClient(f),
  );

  it("finds the server routes", () => {
    // Guard the guard: an empty list makes the assertion below vacuous, which
    // is how the last three checks in this project managed to pass over the
    // thing they were written for.
    expect(routes.length).toBeGreaterThan(5);
  });

  it("never reach a hook without a client boundary", () => {
    const offenders = new Map<string, string>();
    for (const route of routes) {
      for (const reached of serverReachable(route)) {
        if (HOOK_CALL.test(read(reached))) {
          offenders.set(reached.slice(SRC.length + 1), route.slice(SRC.length + 1));
        }
      }
    }
    expect(
      [...offenders].map(([reached, via]) => `${reached} (reached from ${via})`),
      'these call hooks and a server component renders them — add "use client"',
    ).toEqual([]);
  });
});
