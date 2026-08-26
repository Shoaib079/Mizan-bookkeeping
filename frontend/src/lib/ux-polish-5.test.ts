/** Source guards for the five UX polish items (`v0.ux-polish-5`). */

import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("UX polish 5", () => {
  it("sales review CTA says Upload Z report", () => {
    const src = sourceDeclaring("SalesReviewPanel");
    expect(src).toContain("Upload Z report");
    expect(src).not.toContain("Upload via Record");
  });

  it("delivery platforms render two cards per row on desktop", () => {
    const page = sourceAt("app/delivery/page.tsx");
    expect(page).toContain("recon.platforms.length > 0");
    expect(page).toContain('className="grid gap-4 md:grid-cols-2"');
  });

  it("sidebar active row is stronger than a light accent tint alone", () => {
    const src = sourceDeclaring("SidebarNav");
    expect(src).toContain("bg-primary/15");
    expect(src).toContain("font-semibold");
    expect(src).toContain("shadow-[inset_3px_0_0_0_var(--primary)]");
    expect(src).not.toMatch(
      /active &&\s*"bg-sidebar-accent font-medium text-sidebar-accent-foreground"/,
    );
  });

  it("section tabs use larger padding and text", () => {
    const src = sourceDeclaring("SectionTabs");
    expect(src).toContain("px-4 py-2.5 text-base");
    expect(src).not.toContain("px-3 py-2 text-sm font-medium text-muted-foreground");
  });
});
