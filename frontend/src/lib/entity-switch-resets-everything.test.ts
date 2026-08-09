/**
 * Switching restaurant must throw away whatever every page was holding.
 *
 * CURSOR_RULES §1.16 says no page may show one entity's data under another's
 * name. It was enforced per page — call `useEntitySwitchReset`, clear your own
 * state — across 91 pages, and **two** called it. The rest kept a supplier
 * list, a half-typed form, a table of invoices from the restaurant you just
 * left, now under the new one's heading. In a two-company app with different
 * VKNs that is the one mistake that cannot be explained away.
 *
 * The mechanism is now a keyed subtree in `providers.tsx`, so there is no
 * per-page step left to forget and a page written next month is covered
 * without its author knowing the rule exists.
 *
 * That makes the thing worth guarding a question about *composition*, not
 * about logic: is the wrapper still there, and is it still in the right place?
 * There is no branch to unit-test — React's contract is that a changed key
 * remounts, and testing React is not this file's job. What can regress is
 * someone deleting the wrapper, or hoisting it above the provider whose state
 * has to survive.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PROVIDERS = join(process.cwd(), "src/app/providers.tsx");
const source = readFileSync(PROVIDERS, "utf8");

const openTag = (name: string) => source.indexOf(`<${name}`);
const closeTag = (name: string) => source.indexOf(`</${name}>`);

describe("entity switch resets every page", () => {
  it("wraps the page tree, so no page has to remember", () => {
    expect(openTag("EntityScopedTree")).toBeGreaterThan(-1);
  });

  it("puts the pages inside it, not beside it", () => {
    // The failure this catches is a real one and looks harmless in a diff:
    // the wrapper kept, rendered as a sibling, remounting nothing.
    const open = openTag("EntityScopedTree");
    const close = closeTag("EntityScopedTree");
    const children = source.indexOf("{children}", open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    expect(children).toBeGreaterThan(open);
    expect(children).toBeLessThan(close);
  });

  it("sits inside the providers whose state must outlive the remount", () => {
    // UnsavedWorkProvider warns you about work you are about to abandon —
    // it cannot itself be abandoned by the switch it is warning about.
    // QueryProvider holds the cache, whose keys already carry the entity id.
    for (const provider of ["UnsavedWorkProvider", "QueryProvider"]) {
      expect(openTag(provider)).toBeLessThan(openTag("EntityScopedTree"));
      expect(closeTag(provider)).toBeGreaterThan(closeTag("EntityScopedTree"));
    }
  });

  it("keys on the entity, not on something that changes for other reasons", () => {
    const tree = readFileSync(
      join(process.cwd(), "src/components/layout/entity-scoped-tree.tsx"),
      "utf8",
    );
    expect(tree).toContain("key={entityResetKey(entityId)}");
    // Keyed on a route or a render count would remount constantly and clear
    // forms mid-typing — the opposite failure, and a worse one to live with.
    expect(tree).not.toContain("key={pathname");
  });
});
