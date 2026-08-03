import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("entity switch guard wiring", () => {
  it("mounts EntitySwitchGuard in providers", async () => {
    const source = await fs.promises.readFile(
      new URL("../../app/providers.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("EntitySwitchGuard");
  });

  it("mobile switcher is read-only for non-owners", async () => {
    const source = await fs.promises.readFile(
      new URL("./mobile-entity-switcher.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("canSwitchEntity");
    expect(source).toContain("Your restaurant");
  });

  it("account menu hides switch list without canSwitchEntity", async () => {
    const source = await fs.promises.readFile(
      new URL("./account-menu.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("canSwitch && otherEntities.length > 0");
    expect(source).toContain("canCreateEntity");
  });
});
