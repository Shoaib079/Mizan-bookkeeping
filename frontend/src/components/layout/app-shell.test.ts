import { describe, expect, it } from "vitest";

async function readAppShell() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./app-shell.tsx", import.meta.url), "utf8"),
  );
}

describe("AppShell entity-switch reset", () => {
  it("wraps main content area with key={entityId} so pages remount on switch", async () => {
    const source = await readAppShell();
    expect(source).toContain("key={entityId}");
  });
});

describe("AppShell mobile shell (C4)", () => {
  it("renders MobileTopBar and MobileBottomTabs when isMobile", async () => {
    const source = await readAppShell();
    expect(source).toContain("MobileTopBar");
    expect(source).toContain("MobileBottomTabs");
    expect(source).toContain("useIsMobileShell");
    expect(source).toContain("min-h-dvh");
  });

  it("always renders bottom tabs on mobile (including drill-in pages)", async () => {
    // Tabs must depend on `isMobile` alone. Gating them on "is this a tab
    // root" once stranded users on drill-in pages with no way back.
    const source = await readAppShell();
    expect(source).toMatch(/\{isMobile && \(\s*<MobileBottomTabs/);
    expect(source).not.toContain("onMobileTabRoot");
  });

  it("the desktop sidebar cannot move — the window does not scroll at all", async () => {
    // `sticky` was not enough: a sticky element still lives in the document's
    // scroll, so rubber-banding past the top or bottom dragged the sidebar.
    // The shell is one viewport tall with the document overflow hidden, so
    // there is no page scroll left to drag anything.
    const source = await readAppShell();
    const desktop = source.slice(source.lastIndexOf("  return ("));

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

  it("resets the scroll container on navigation", async () => {
    // Next scrolls `window` on route change; the window no longer scrolls, so
    // without this a new page opens still scrolled down the previous one.
    const source = await readAppShell();
    expect(source).toContain("mainRef.current?.scrollTo({ top: 0 })");
    expect(source).toMatch(/\}, \[pathname\]\);/);
  });

  it("hides desktop sidebar on mobile branch", async () => {
    const source = await readAppShell();
    const start = source.indexOf("if (isMobile) {");
    const end = source.indexOf("\n  return (", start + 1);
    const mobileBranch = source.slice(start, end);
    expect(mobileBranch).not.toContain("SidebarNav");
    expect(mobileBranch).toContain("MobileBottomTabs");
  });
});
