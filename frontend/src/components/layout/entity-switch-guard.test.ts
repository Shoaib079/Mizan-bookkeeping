import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

describe("entity switch guard wiring", () => {
  it("mounts EntitySwitchGuard in providers", async () => {
    const source = sourceDeclaring("Providers");
    expect(source).toContain("EntitySwitchGuard");
  });

  it("mobile switcher is read-only for non-owners", async () => {
    const source = sourceDeclaring("MobileEntitySwitcher");
    expect(source).toContain("canSwitchEntity");
    expect(source).toContain("Your restaurant");
  });

  it("entity context blocks setEntityId when policy is locked", async () => {
    const source = sourceDeclaring("EntityProvider");
    expect(source).toContain("maySetEntityId");
    expect(source).toContain("visibleEntities");
  });

  it("policy module is the single global gate", async () => {
    const source = sourceDeclaring("EntitySwitchPolicy");
    expect(source).toContain("maySetEntityId");
  });

  it("does not lock entity switch before membership is settled", async () => {
    const source = sourceDeclaring("EntitySwitchGuard");
    expect(source).toContain("membershipSettled");
    expect(source).not.toMatch(/\bloading\b/);
  });

  it("account menu hides switch list without canSwitchEntity", async () => {
    const source = sourceDeclaringAll(
      "AccountMenu",
      "AccountMenuPanel",
      "useAccountMenuPanel",
      "AccountMenuDropdown",
    );
    expect(source).toContain("canSwitch && otherEntities.length > 0");
    expect(source).toContain("canCreateEntity");
    expect(source).toContain("canSwitch ? entities : visibleEntities");
  });
});
