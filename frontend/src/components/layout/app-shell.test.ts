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
