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

describe("the download dropdown is not forked per feature", () => {
  /* This used to look for files named `*-download-menu.tsx` and forgive any
   * whose name contained "report". Two things were wrong with that, and the
   * second is why it is rewritten rather than patched:
   *
   * - It classified by filename. Renaming the delivery hub's toolbar to
   *   `delivery-download-menu.tsx` made it fail, and moving the same code to a
   *   file called anything else would have made it pass — which is the D9
   *   lesson in miniature.
   * - The forgiveness was doing real work. `report-download-menu.tsx` was a
   *   third copy of the same dropdown all along, sitting behind an exclusion
   *   that read like a note about scope. Two of the three copies had menu
   *   items under the 44px a thumb needs.
   *
   * So the rule is now about the dropdown itself: whatever a menu is called
   * and whatever it downloads, only one file may implement the trigger,
   * the outside-click dismissal and the floating card. */
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = `${dir}/${entry}`;
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  /** Files that build their own Download trigger with a card under it.
   *
   * Three marks together — the icon, an absolutely-positioned block, and the
   * open state — so a file that merely *renders* a shared menu, or opens some
   * unrelated popover, is not counted.
   */
  function dropdownImplementations(): string[] {
    return walk(SRC + "components")
      .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return (
          /import \{[^}]*\bDownload\b[^}]*\} from "lucide-react"/.test(s) &&
          s.includes("absolute") &&
          s.includes("setOpen")
        );
      })
      .map((f) => f.replace(SRC, ""));
  }

  /** Its own dropdown, and why that is allowed.
   *
   * A mapping rather than a list, so the reason travels with the name — a bare
   * exclusion is indistinguishable from an oversight, which is precisely how
   * `report-download-menu.tsx` stayed a third copy for as long as it did.
   */
  const ALLOWED_OWN_DROPDOWN: Record<string, string> = {
    "components/reports/month-pack-button.tsx":
      "its rows carry an icon and a description line under a 'Choose format' " +
      "heading, and it has a compact sticky-bar variant for mobile reports — " +
      "folding that in would push three presentational options into the " +
      "shared shell to serve one caller",
  };

  it("finds the components tree", () => {
    // Over an empty walk every assertion below passes by comparing nothing.
    expect(walk(SRC + "components").length).toBeGreaterThan(100);
    expect(dropdownImplementations().length).toBeGreaterThan(0);
  });

  it("only one component implements the plain menu", () => {
    const found = dropdownImplementations().filter(
      (f) => !(f in ALLOWED_OWN_DROPDOWN),
    );
    expect(
      found,
      "these each build their own Download dropdown; render " +
        "<DownloadMenu items={…} /> instead, or add a reason to " +
        "ALLOWED_OWN_DROPDOWN:\n" +
        found.join("\n"),
    ).toEqual(["components/ui/download-menu.tsx"]);
  });

  it("the exceptions still exist", () => {
    // An exception for a file that has moved or gone forgives nothing and
    // hides the fact that the rule now covers less than it says.
    const found = dropdownImplementations();
    const stale = Object.keys(ALLOWED_OWN_DROPDOWN).filter(
      (f) => !found.includes(f),
    );
    expect(
      stale,
      `ALLOWED_OWN_DROPDOWN names files that no longer build one: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
