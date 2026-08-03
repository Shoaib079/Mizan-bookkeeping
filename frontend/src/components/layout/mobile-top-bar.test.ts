import { describe, expect, it } from "vitest";

async function readMobileTopBar() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./mobile-top-bar.tsx", import.meta.url), "utf8"),
  );
}

describe("MobileTopBar back navigation (C4)", () => {
  it("uses mobileBackDestination so review drill-ins do not loop via /review", async () => {
    const source = await readMobileTopBar();
    expect(source).toContain("mobileBackDestination");
    expect(source).not.toContain('router.push("/more")');
  });

  it("asks before leaving when a form has unsaved edits", async () => {
    const source = await readMobileTopBar();
    expect(source).toContain("requestLeave");
  });
});
