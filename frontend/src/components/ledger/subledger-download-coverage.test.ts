import { readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Every subledger detail page offers the same download.
 *
 * For a long time only the partner ledger had one, and nobody noticed the
 * other three were missing — there is no error, no empty state, just an
 * absent button. A gap that looks like a design decision is the hardest kind
 * to find, so it is asserted rather than remembered.
 *
 * The URL is checked as well as the presence, because the menu takes a path
 * string: a typo there produces a button that 404s only when pressed, which
 * no type check can see.
 */

const SRC = new URL("../..", import.meta.url).pathname;

const LEDGER_PAGES = [
  {
    name: "partner",
    file: "app/partners/[id]/page.tsx",
    path: "/entities/${entityId}/partners/${partnerId}/ledger",
  },
  {
    name: "staff",
    file: "app/staff/[id]/page.tsx",
    path: "/entities/${entityId}/staff/employees/${employeeId}/ledger",
  },
  {
    name: "customer",
    file: "app/(customers-section)/customers/[id]/page.tsx",
    path: "/entities/${entityId}/customers/${customerId}/ledger",
  },
  {
    name: "supplier",
    file: "app/(procurement)/suppliers/[id]/page.tsx",
    path: "/entities/${entityId}/suppliers/${supplierId}/ledger",
  },
];

describe.each(LEDGER_PAGES)("the $name ledger can be downloaded", ({ file, path }) => {
  const source = () => readFileSync(SRC + file, "utf8");

  it("renders the shared download menu", () => {
    expect(source()).toContain("<SubledgerDownloadMenu");
  });

  it("points at its own ledger endpoint", () => {
    // Backtick-quoted template literal, exactly as written in the page.
    expect(source(), `${file} has the wrong download path`).toContain(
      `\`${path}\``,
    );
  });
});

describe("the download menu is not forked per feature", () => {
  it("only one download menu component exists", () => {
    // The partner page owned a private copy; three more copies is how the
    // hover state gets fixed in one and not the others.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = `${dir}/${entry}`;
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const menus = walk(SRC + "components").filter((f) =>
      /download-menu\.tsx$/.test(f),
    );
    const names = menus.map((f) => f.replace(SRC, ""));
    // report-download-menu is a different thing: it downloads a report for a
    // date range, not a subject's ledger.
    const subledgerMenus = names.filter((n) => !n.includes("report"));
    expect(
      subledgerMenus,
      `expected one shared subledger download menu, found:\n${subledgerMenus.join("\n")}`,
    ).toEqual(["components/ledger/subledger-download-menu.tsx"]);
  });
});
