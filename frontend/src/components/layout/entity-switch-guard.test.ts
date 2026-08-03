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

  it("entity context blocks setEntityId when policy is locked", async () => {
    const source = await fs.promises.readFile(
      new URL("../../lib/entity-context.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("maySetEntityId");
    expect(source).toContain("visibleEntities");
  });

  it("policy module is the single global gate", async () => {
    const source = await fs.promises.readFile(
      new URL("../../lib/entity-switch-policy.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("maySetEntityId");
  });

  it("does not lock entity switch before membership is settled", async () => {
    const source = await fs.promises.readFile(
      new URL("./entity-switch-guard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("membershipSettled");
    expect(source).not.toMatch(/\bloading\b/);
  });

  it("account menu hides switch list without canSwitchEntity", async () => {
    const source = await fs.promises.readFile(
      new URL("./account-menu.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("canSwitch && otherEntities.length > 0");
    expect(source).toContain("canCreateEntity");
    expect(source).toContain("canSwitch ? entities : visibleEntities");
  });
});
