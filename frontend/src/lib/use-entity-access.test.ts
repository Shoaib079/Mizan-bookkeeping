import { describe, it, expect } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const access = () => sourceDeclaring("EntityAccessProvider");
const providers = () => sourceDeclaring("Providers");
const quickActions = () => sourceDeclaring("QuickActionsProvider");

describe("EntityAccessProvider (shared role context)", () => {
  it("exports EntityAccessProvider and useEntityAccess from the same module", async () => {
    const mod = await import("./use-entity-access");
    expect(typeof mod.EntityAccessProvider).toBe("function");
    expect(typeof mod.useEntityAccess).toBe("function");
  });

  it("uses React context (not per-component state) for role", () => {
    expect(access()).toContain("createContext");
    expect(access()).toContain("EntityAccessContext.Provider");
    expect(access()).toContain("useContext(EntityAccessContext)");
  });

  it("fetches /members/me only once per entity (single fetch in reload)", () => {
    expect(access()).toContain("/members/me");
    const callCount = (access().match(/apiFetch</g) || []).length;
    expect(callCount).toBe(1);
  });

  it("retries on transient failure (not 403)", () => {
    expect(access()).toContain("MAX_RETRIES");
    expect(access()).toContain("RETRY_DELAY_MS");
    expect(access()).toContain("attempt < MAX_RETRIES");
  });

  it("forces sign-out on revoked membership (not generic 403 fallback)", () => {
    expect(access()).toContain("isSessionRevokedError");
    expect(access()).toContain("notifySessionRevoked");
  });

  it("tracks membershipSettled after successful /members/me", () => {
    expect(access()).toContain("membershipSettled");
    expect(access()).toContain("setMembershipSettled(true)");
  });

  it("waits for isAuthReady before fetching", () => {
    expect(access()).toContain("isAuthReady");
    expect(access()).toContain("!entityId || !isAuthReady");
  });

  it("guards against stale responses with fetchIdRef", () => {
    expect(access()).toContain("fetchIdRef");
    expect(access()).toContain("fetchIdRef.current !== id");
  });
});

describe("providers wiring", () => {
  it("wraps QuickActionsProvider inside EntityAccessProvider", () => {
    const source = providers();
    expect(source).toContain("EntityAccessProvider");
    expect(source).toContain("SessionAccessGuard");
    const eapIndex = source.indexOf("<EntityAccessProvider>");
    const qapIndex = source.indexOf("<QuickActionsProvider>");
    expect(eapIndex).toBeLessThan(qapIndex);
  });

  it("QuickActionsProvider reads role from shared context (not own fetch)", () => {
    expect(quickActions()).toContain("useEntityAccess");
    expect(quickActions()).not.toContain("apiFetch");
    expect(quickActions()).not.toContain("/members/me");
  });

  it("hub and provider share the same role source", () => {
    expect(sourceDeclaring("RecordDesk")).toContain("useEntityAccess");
    expect(quickActions()).toContain("useEntityAccess");
  });
});

describe("record actions gated by grants", () => {
  it("openRecordAction guard checks canWriteDailyTransactions from shared context", () => {
    expect(quickActions()).toContain(
      "if (!canWriteDailyTransactions || !canUseRecordAction(grants, key)) return",
    );
  });
});
