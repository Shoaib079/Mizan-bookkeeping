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

  it("pins the desktop sidebar so it does not scroll with the page", async () => {
    // The nav used to scroll away with the content, so switching section from
    // the bottom of a long ledger meant scrolling back to the top first.
    const source = await readAppShell();
    const aside = source.slice(source.indexOf("<aside"), source.indexOf("</aside>"));
    expect(aside).toContain("sticky top-0");
    expect(aside).toContain("h-screen");
    // A tall nav has to scroll inside the sidebar, not stretch the page.
    expect(aside).toContain("overflow-y-auto");
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
