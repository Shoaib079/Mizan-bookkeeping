/**
 * Page H1 must not repeat a visible section chrome label.
 *
 * Tabs come from NAV_SECTIONS (via SectionTabs / SectionShell), not from
 * `label: "…"` on the page. Shell title = section name (mobile top bar).
 * PageHeader / ListPage / HubPage / … own the H1 — it must be more specific.
 */

import { describe, expect, it } from "vitest";

import { NAV_SECTIONS } from "@/lib/nav-sections-data";
import type { NavSectionId } from "@/lib/nav-section-types";
import { codeOnly, sourceAt, sourceFiles } from "@/test-support/source";

/** Mirrors SectionShell — keep in sync with section-shell.tsx. */
const SECTION_SHELL_TITLE: Record<NavSectionId, string> = {
  sales: "Sales",
  banking: "Banking",
  suppliers: "Suppliers",
  customers: "Customers",
  staff: "Staff",
  partners: "Partners",
  review: "Review",
  delivery: "Delivery",
};

/** Layouts that mount SectionTabs / SectionShell → app dirs they wrap. */
const SECTIONED_ROOTS: { sectionId: NavSectionId; roots: string[] }[] = [
  { sectionId: "sales", roots: ["app/(sales)"] },
  { sectionId: "banking", roots: ["app/banking"] },
  { sectionId: "suppliers", roots: ["app/(procurement)"] },
  { sectionId: "customers", roots: ["app/(customers-section)"] },
  { sectionId: "review", roots: ["app/review"] },
  { sectionId: "delivery", roots: ["app/delivery"] },
];

const ARCHETYPE =
  /<(?:PageHeader|ListPage|HubPage|ReportPage|OverviewPage|DocumentReviewPage|FormPage|EntityDetailPage)\b[\s\S]*?>/g;

const TITLE_ATTR =
  /\btitle=(?:\{\s*(?:\"([^\"]+)\"|'([^']+)')\s*\}|\"([^\"]+)\"|'([^']+)')/;

const DEFAULT_TITLE_PARAM =
  /\btitle\s*=\s*(?:\"([^\"]+)\"|'([^']+)')\s*[,)]/;

const PANEL_FROM_PAGE =
  /(?:from\s+[\"']@\/([^\"']+)[\"']|import\([\"']@\/([^\"']+)[\"'])/g;

function chromeLabels(sectionId: NavSectionId): string[] {
  const section = NAV_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Unknown section ${sectionId}`);
  return [...section.tabs.map((t) => t.label), SECTION_SHELL_TITLE[sectionId]];
}

function firstArchetypeTitle(source: string): string | null {
  const code = codeOnly(source);
  for (const open of code.matchAll(ARCHETYPE)) {
    const tag = open[0] ?? "";
    const m = TITLE_ATTR.exec(tag);
    if (!m) continue;
    return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
  }
  const def = DEFAULT_TITLE_PARAM.exec(code);
  if (def) return def[1] ?? def[2] ?? null;
  return null;
}

function trySourceAt(rel: string): string | null {
  try {
    return sourceAt(rel);
  } catch {
    return null;
  }
}

function resolvePageTitle(pageSource: string): string | null {
  const direct = firstArchetypeTitle(pageSource);
  if (direct) return direct;

  // Thin pages that only mount a panel — follow @/ imports to the panel source.
  for (const m of pageSource.matchAll(PANEL_FROM_PAGE)) {
    const rel = m[1] ?? m[2];
    if (!rel) continue;
    const withExt = rel.endsWith(".tsx") || rel.endsWith(".ts") ? rel : `${rel}.tsx`;
    const text =
      trySourceAt(withExt) ??
      trySourceAt(withExt.replace(/\.tsx$/, ".ts")) ??
      sourceFiles().find((f) => f.path === withExt)?.text ??
      null;
    if (!text) continue;
    const title = firstArchetypeTitle(text);
    if (title) return title;
  }
  return null;
}

function pagesUnder(roots: string[]): { path: string; text: string }[] {
  return sourceFiles().filter(
    (f) =>
      f.path.endsWith("/page.tsx") &&
      roots.some((root) => f.path === `${root}/page.tsx` || f.path.startsWith(`${root}/`)),
  );
}

describe("no duplicate headings — section tabs / shell vs page H1", () => {
  it("SECTION_SHELL_TITLE in this guard matches SectionShell", () => {
    const shell = sourceAt("components/layout/section-shell.tsx");
    for (const [id, title] of Object.entries(SECTION_SHELL_TITLE)) {
      expect(shell, id).toContain(`${id}: "${title}"`);
    }
  });

  it("sectioned layouts still use SectionTabs or SectionShell", () => {
    for (const { sectionId } of SECTIONED_ROOTS) {
      const layouts = sourceFiles().filter(
        (f) =>
          f.path.endsWith("/layout.tsx") &&
          (f.text.includes(`sectionId="${sectionId}"`) ||
            f.text.includes(`sectionId={'${sectionId}'}`)),
      );
      expect(layouts.length, sectionId).toBeGreaterThan(0);
      for (const layout of layouts) {
        expect(
          layout.text.includes("SectionTabs") || layout.text.includes("SectionShell"),
          layout.path,
        ).toBe(true);
      }
    }
  });

  it("page H1 never equals a tab label or the section shell title", () => {
    const collisions: string[] = [];

    for (const { sectionId, roots } of SECTIONED_ROOTS) {
      const forbidden = new Set(chromeLabels(sectionId));
      for (const page of pagesUnder(roots)) {
        const title = resolvePageTitle(page.text);
        if (!title) continue;
        if (forbidden.has(title)) {
          collisions.push(
            `${page.path}: H1 "${title}" duplicates section "${sectionId}" chrome (${[...forbidden].join(" | ")})`,
          );
        }
      }
    }

    expect(collisions, collisions.join("\n")).toEqual([]);
  });

  it("staff and partners directories also avoid shell/tab label as H1", () => {
    // These live in NAV_SECTIONS but do not wrap with SectionShell yet —
    // still fail when ListPage H1 repeats the shell/tab name.
    const cases: { path: string; sectionId: NavSectionId }[] = [
      { path: "app/staff/page.tsx", sectionId: "staff" },
      { path: "app/partners/page.tsx", sectionId: "partners" },
    ];
    const collisions: string[] = [];
    for (const { path, sectionId } of cases) {
      const forbidden = new Set(chromeLabels(sectionId));
      const title = resolvePageTitle(sourceAt(path));
      if (title && forbidden.has(title)) {
        collisions.push(`${path}: H1 "${title}" duplicates ${sectionId} chrome`);
      }
    }
    expect(collisions, collisions.join("\n")).toEqual([]);
  });
});
