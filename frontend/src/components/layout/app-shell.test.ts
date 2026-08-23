import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** The whole file, as before — several assertions below slice it up by hand
 *  to separate the mobile branch from the desktop one. */
const source = () => sourceDeclaring("AppShell");

describe("AppShell entity-switch reset", () => {
  it("wraps main content area with key={entityId} so pages remount on switch", () => {
    expect(source()).toContain("key={entityId}");
  });
});

describe("AppShell page trail — never duplicates the H1", () => {
  it("trail is breadcrumb only; does not append title beside PageHeader", () => {
    const src = source();
    expect(src).toContain("const trail = breadcrumb");
    expect(src).toContain('data-testid="page-shell-trail"');
    expect(src).not.toContain(
      "const trail = [breadcrumb, title].filter(Boolean).join",
    );
  });

  it("mutation: trail appends title again → red", () => {
    const src = source();
    expect(src).not.toMatch(
      /trail\s*=\s*\[breadcrumb,\s*title\]/,
    );
    expect(src).not.toMatch(
      /\[breadcrumb,\s*title\]\.filter\(Boolean\)\.join/,
    );
  });
});

describe("AppShell mobile shell (C4)", () => {
  it("renders MobileTopBar and MobileBottomTabs when isMobile", () => {
    expect(source()).toContain("MobileTopBar");
    expect(source()).toContain("MobileBottomTabs");
    expect(source()).toContain("useIsMobileShell");
    expect(source()).toContain("min-h-dvh");
  });

  it("always renders bottom tabs on mobile (including drill-in pages)", () => {
    // Tabs must depend on `isMobile` alone. Gating them on "is this a tab
    // root" once stranded users on drill-in pages with no way back.
    expect(source()).toMatch(/\{isMobile && \(\s*<MobileBottomTabs/);
    expect(source()).not.toContain("onMobileTabRoot");
  });

  it("the desktop sidebar cannot move — the window does not scroll at all", () => {
    // `sticky` was not enough: a sticky element still lives in the document's
    // scroll, so rubber-banding past the top or bottom dragged the sidebar.
    // The shell is one viewport tall with the document overflow hidden, so
    // there is no page scroll left to drag anything.
    const text = source();
    const desktop = text.slice(text.lastIndexOf("  return ("));

    expect(desktop).toContain("h-screen overflow-hidden");
    const aside = desktop.slice(
      desktop.indexOf("<aside"),
      desktop.indexOf("</aside>"),
    );
    expect(aside).not.toContain("sticky");
    // A tall nav scrolls inside the sidebar rather than stretching the page.
    expect(aside).toContain("overflow-y-auto");

    // Only <main> scrolls...
    expect(desktop).toMatch(/<main[\s\S]*?overflow-y-auto/);
    // ...and it must not chain its overscroll back to the document.
    expect(desktop).toMatch(/<main[\s\S]*?overscroll-contain/);
  });

  it("resets the scroll container on navigation", () => {
    // Next scrolls `window` on route change; the window no longer scrolls, so
    // without this a new page opens still scrolled down the previous one.
    expect(source()).toContain("mainRef.current?.scrollTo({ top: 0 })");
    expect(source()).toMatch(/\}, \[pathname\]\);/);
  });

  it("hides desktop sidebar on mobile branch", () => {
    const text = source();
    const start = text.indexOf("if (isMobile) {");
    const end = text.indexOf("\n  return (", start + 1);
    const mobileBranch = text.slice(start, end);
    expect(mobileBranch).not.toContain("SidebarNav");
    expect(mobileBranch).toContain("MobileBottomTabs");
  });
});
