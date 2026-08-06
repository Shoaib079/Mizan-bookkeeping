import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** "Edit" sits beside the name it edits, on every entity detail page.
 *
 * It used to live in the "⋯" menu on all four. That menu is for things you
 * rarely do, and renaming a customer or a supplier is not rare — hiding it
 * there made an ordinary act feel like an advanced one, and it took a person
 * saying so to notice.
 *
 * Checked per page rather than trusting the archetype, because the archetype
 * only offers the slot; a page can still put Edit back in the overflow, and
 * would if someone copied an older page as a starting point.
 */

const SRC = new URL("../..", import.meta.url).pathname;

const DETAIL_PAGES = [
  { name: "customer", file: "app/(customers-section)/customers/[id]/page.tsx" },
  { name: "supplier", file: "app/(procurement)/suppliers/[id]/page.tsx" },
  { name: "staff", file: "app/staff/[id]/page.tsx" },
  { name: "partner", file: "app/partners/[id]/page.tsx" },
];

describe.each(DETAIL_PAGES)("the $name detail page", ({ file }) => {
  const source = () => readFileSync(SRC + file, "utf8");

  it("puts Edit beside the title", () => {
    expect(source()).toContain("titleAction={<EditTitleButton");
  });

  it("does not also keep Edit in the overflow menu", () => {
    // Two ways to do the same thing is worse than either — and the overflow
    // copy is the one nobody would notice had gone stale.
    const overflow = source().match(/overflowActions=\{\[[\s\S]*?\]\}/)?.[0];
    if (!overflow) return; // pages with no overflow menu at all
    expect(overflow, "Edit is in both places").not.toMatch(/label: "Edit/);
  });

  it("uses the shared button rather than its own copy", () => {
    // Four hand-written buttons drift into four different icons and sizes.
    expect(source()).toContain(
      'from "@/components/page/page-header"',
    );
    expect(source()).not.toMatch(/<Pencil\b/);
  });
});

describe("the shared edit button", () => {
  const button = readFileSync(
    new URL("./page-header.tsx", import.meta.url),
    "utf8",
  );

  it("is a ghost, not a filled button", () => {
    // It sits next to a heading; a solid button there competes with the
    // page's actual primary action.
    // `\n}\n` — a closing brace at column 0 followed by a blank line. Matching
    // the first `\n}` stopped at the end of the props type annotation, so the
    // body was never examined and the assertion failed on text it never saw.
    const fn = button.match(/export function EditTitleButton[\s\S]*?\n\}\n/)?.[0];
    expect(fn, "EditTitleButton not found").toBeTruthy();
    expect(fn).toContain('variant="ghost"');
  });

  it("still carries a colour", () => {
    // `ghost` resolves to text-primary — see clickable-colour.test.ts for why
    // a control with no colour at rest reads as plain text.
    const variants = readFileSync(
      new URL("../ui/button.tsx", import.meta.url),
      "utf8",
    );
    expect(variants).toMatch(/variant === "ghost" && "text-primary/);
  });
});
