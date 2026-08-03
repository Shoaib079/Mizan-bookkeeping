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
    expect(source).toContain("isMobileTabRoot");
    expect(source).toContain("min-h-dvh");
  });

  it("always renders bottom tabs on mobile (including drill-in pages)", async () => {
    const source = await readAppShell();
    expect(source).toContain("const showMobileTabs = isMobile");
    expect(source).not.toContain("showMobileTabs = isMobile && onMobileTabRoot");
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
