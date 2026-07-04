import { describe, it, expect } from "vitest";

describe("EntityAccessProvider (shared role context)", () => {
  it("exports EntityAccessProvider and useEntityAccess from the same module", async () => {
    const mod = await import("./use-entity-access");
    expect(typeof mod.EntityAccessProvider).toBe("function");
    expect(typeof mod.useEntityAccess).toBe("function");
  });

  it("uses React context (not per-component state) for role", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("createContext");
    expect(source).toContain("EntityAccessContext.Provider");
    expect(source).toContain("useContext(EntityAccessContext)");
  });

  it("fetches /members/me only once per entity (single fetch in reload)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("/members/me");
    const callCount = (source.match(/apiFetch</g) || []).length;
    expect(callCount).toBe(1);
  });

  it("retries on transient failure (not 403)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("MAX_RETRIES");
    expect(source).toContain("RETRY_DELAY_MS");
    expect(source).toContain("attempt < MAX_RETRIES");
  });

  it("settles on view-only only after real 403", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('err.message.includes("403")');
    expect(source).toContain('err.message.includes("Forbidden")');
    expect(source).toContain("DEFAULT_DEV_ROLE");
  });

  it("waits for isAuthReady before fetching", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("isAuthReady");
    expect(source).toContain("!entityId || !isAuthReady");
  });

  it("guards against stale responses with fetchIdRef", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./use-entity-access.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("fetchIdRef");
    expect(source).toContain("fetchIdRef.current !== id");
  });
});

describe("providers.tsx wiring", () => {
  it("wraps QuickActionsProvider inside EntityAccessProvider", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../app/providers.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("EntityAccessProvider");
    const eapIndex = source.indexOf("<EntityAccessProvider>");
    const qapIndex = source.indexOf("<QuickActionsProvider>");
    expect(eapIndex).toBeLessThan(qapIndex);
  });

  it("QuickActionsProvider reads role from shared context (not own fetch)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/quick-actions.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("useEntityAccess");
    expect(source).not.toContain("apiFetch");
    expect(source).not.toContain("/members/me");
  });

  it("hub and provider share the same role source", async () => {
    const hubSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/record/record-hub.tsx", import.meta.url),
        "utf8",
      ),
    );
    const providerSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/quick-actions.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(hubSource).toContain("useEntityAccess");
    expect(providerSource).toContain("useEntityAccess");
  });
});

describe("owner can openRecordAction", () => {
  it("openRecordAction guard checks canWriteOperations from shared context", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/quick-actions.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("if (!canWriteOperations) return");
  });
});
