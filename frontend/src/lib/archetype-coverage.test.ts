import { readFile, readdir } from "fs/promises";
import { describe, expect, it } from "vitest";

/** The migration checklist in DESIGN_ARCHETYPES.md is only trustworthy if it
 * genuinely lists every page that renders UI. This walks `app/` for ground
 * truth — so a new page can't be added without listing it, and an existing one
 * can't be quietly skipped or counted twice. */

const APP_DIR = new URL("../app/", import.meta.url);

type PageFile = { route: string; url: URL };

async function collectPages(dir: URL, prefix = ""): Promise<PageFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: PageFile[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Route groups `(name)` and catch-alls `[[...x]]` add no URL segment.
      const segment =
        entry.name.startsWith("(") || entry.name.startsWith("[[")
          ? ""
          : `/${entry.name}`;
      found.push(
        ...(await collectPages(new URL(`${entry.name}/`, dir), `${prefix}${segment}`)),
      );
    } else if (entry.name === "page.tsx") {
      found.push({ route: prefix || "/", url: new URL(entry.name, dir) });
    }
  }
  return found;
}

/** A page that only bounces elsewhere has no design surface to migrate.
 *
 * Detected by what the page *renders*, not by which redirect helper it calls —
 * a name-based rule silently mis-classifies pages the day someone adds another
 * helper (which is exactly how 14 legacy `redirectLegacySetup` shims were first
 * miscounted as live pages). A page with no JSX renders nothing; a page whose
 * only JSX is a skeleton is a client-side bounce. */
function isRedirectOnly(source: string): boolean {
  const jsx = source.match(/<([A-Za-z][\w.]*)[\s/>]/g) ?? [];
  if (jsx.length === 0) return true;
  const bounces = /\bredirect\(|router\.(?:replace|push)\(/.test(source);
  return bounces && jsx.every((tag) => /Skeleton|Fragment|>$/.test(tag));
}

async function checklistRoutes(): Promise<string[]> {
  const doc = await readFile(
    new URL("../../../DESIGN_ARCHETYPES.md", import.meta.url),
    "utf8",
  );
  // Boxes may be ticked (☑) or not (☐) — coverage is about what is listed.
  const section = doc.split("## Migration checklist")[1] ?? "";
  const slices = section.split(/^### Slice /m).filter((block) => /^[2-7]\b/.test(block));
  return slices.flatMap((block) =>
    [...block.matchAll(/[☐☑] `(\/[^`]*)`/g)].map((match) => match[1]),
  );
}

describe("DESIGN_ARCHETYPES migration checklist", () => {
  it("lists every page that renders UI", async () => {
    const listed = new Set(await checklistRoutes());
    const pages = await collectPages(APP_DIR);

    const missing: string[] = [];
    for (const page of pages) {
      if (listed.has(page.route)) continue;
      if (isRedirectOnly(await readFile(page.url, "utf8"))) continue;
      missing.push(page.route);
    }

    expect(missing, `pages not on the checklist: ${missing.join(", ")}`).toEqual([]);
  });

  it("never lists the same route in two slices", async () => {
    const listed = await checklistRoutes();
    const duplicates = listed.filter(
      (route, index) => listed.indexOf(route) !== index,
    );
    expect(duplicates, `duplicated: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("lists no route that has no page file", async () => {
    const pages = new Set((await collectPages(APP_DIR)).map((page) => page.route));
    const stale = (await checklistRoutes()).filter((route) => !pages.has(route));
    expect(stale, `checklist names missing pages: ${stale.join(", ")}`).toEqual([]);
  });

  it("includes the dashboard", async () => {
    expect(await checklistRoutes()).toContain("/");
  });
});
