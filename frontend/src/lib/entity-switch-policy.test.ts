import { describe, expect, it, vi } from "vitest";

import {
  maySetEntityId,
  resetEntitySwitchPolicy,
  setEntitySwitchPolicy,
} from "@/lib/entity-switch-policy";

describe("entity-switch-policy", () => {
  it("allows any entity change for owners (default policy)", () => {
    resetEntitySwitchPolicy();
    expect(maySetEntityId("any-id")).toBe(true);
  });

  it("blocks non-owners from changing away from locked restaurant", () => {
    setEntitySwitchPolicy({ canSwitch: false, lockedEntityId: "india-gate" });
    expect(maySetEntityId("india-gate")).toBe(true);
    expect(maySetEntityId("other-place")).toBe(false);
    resetEntitySwitchPolicy();
  });
});
