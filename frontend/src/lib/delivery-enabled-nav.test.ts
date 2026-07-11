import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  clearDeliveryEnabledCache,
  fetchDeliveryEnabled,
  getCachedDeliveryEnabled,
  invalidateDeliveryEnabled,
  refreshDeliveryEnabledForEntity,
} from "@/lib/delivery-enabled-cache";
import {
  filterNavItemsByEntitySettings,
  appRoutes,
} from "@/lib/app-routes";

vi.mock("@/lib/entity-settings", () => ({
  isEntitySettingEnabled: vi.fn(),
}));

import { isEntitySettingEnabled } from "@/lib/entity-settings";

const mockedSetting = vi.mocked(isEntitySettingEnabled);

describe("delivery enabled cache", () => {
  beforeEach(() => {
    clearDeliveryEnabledCache("entity-a");
    clearDeliveryEnabledCache("entity-b");
    mockedSetting.mockReset();
  });

  it("does not cache false when fetch fails (pre-auth / network)", async () => {
    mockedSetting.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const result = await fetchDeliveryEnabled("entity-a");
    expect(result).toBeNull();
    expect(getCachedDeliveryEnabled("entity-a")).toBeUndefined();
  });

  it("caches authenticated false — delivery really off", async () => {
    mockedSetting.mockResolvedValueOnce(false);
    const result = await fetchDeliveryEnabled("entity-a");
    expect(result).toBe(false);
    expect(getCachedDeliveryEnabled("entity-a")).toBe(false);
  });

  it("refetches after invalidate so deliveryEnabled updates without stale cache", async () => {
    mockedSetting.mockResolvedValueOnce(true);
    await fetchDeliveryEnabled("entity-a");
    expect(getCachedDeliveryEnabled("entity-a")).toBe(true);

    mockedSetting.mockResolvedValueOnce(false);
    const enabled = await refreshDeliveryEnabledForEntity("entity-a");
    expect(enabled).toBe(false);
    expect(getCachedDeliveryEnabled("entity-a")).toBe(false);
    expect(mockedSetting).toHaveBeenLastCalledWith("entity-a", "delivery_enabled");
  });

  it("retries after failed fetch once auth succeeds", async () => {
    mockedSetting.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const first = await fetchDeliveryEnabled("entity-a");
    expect(first).toBeNull();
    expect(getCachedDeliveryEnabled("entity-a")).toBeUndefined();

    mockedSetting.mockResolvedValueOnce(true);
    const second = await fetchDeliveryEnabled("entity-a");
    expect(second).toBe(true);
    expect(getCachedDeliveryEnabled("entity-a")).toBe(true);
  });

  it("does not leak delivery state across entities", async () => {
    mockedSetting.mockImplementation(async (entityId, key) => {
      if (entityId === "entity-a" && key === "delivery_enabled") return true;
      if (entityId === "entity-b" && key === "delivery_enabled") return false;
      return false;
    });

    await fetchDeliveryEnabled("entity-a");
    await fetchDeliveryEnabled("entity-b");

    expect(getCachedDeliveryEnabled("entity-a")).toBe(true);
    expect(getCachedDeliveryEnabled("entity-b")).toBe(false);

    mockedSetting.mockResolvedValueOnce(false);
    await refreshDeliveryEnabledForEntity("entity-a");

    expect(getCachedDeliveryEnabled("entity-a")).toBe(false);
    expect(getCachedDeliveryEnabled("entity-b")).toBe(false);
  });

  it("invalidateDeliveryEnabled dispatches entity-scoped event", () => {
    const handler = vi.fn();
    const dispatchEvent = vi.fn((event: Event) => {
      handler(event);
      return true;
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent,
    });

    invalidateDeliveryEnabled("entity-a");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(
      (handler.mock.calls[0][0] as CustomEvent<{ entityId: string }>).detail
        .entityId,
    ).toBe("entity-a");
    expect(getCachedDeliveryEnabled("entity-a")).toBeUndefined();

    vi.unstubAllGlobals();
  });
});

describe("delivery nav visibility", () => {
  // IA v2: Delivery lives in the "Money in" sidebar group.
  const overviewHub = appRoutes.filter(
    (route) => route.group === "Money in" && !route.nestedUnder,
  );

  it("shows Delivery nav when deliveryEnabled is true", () => {
    const items = filterNavItemsByEntitySettings(overviewHub, {
      deliveryEnabled: true,
    });
    expect(items.some((item) => item.href === "/delivery")).toBe(true);
  });

  it("hides Delivery nav when deliveryEnabled is false", () => {
    const items = filterNavItemsByEntitySettings(overviewHub, {
      deliveryEnabled: false,
    });
    expect(items.some((item) => item.href === "/delivery")).toBe(false);
  });
});

describe("QuickActionsProvider auth gating", () => {
  it("waits for isAuthReady before fetching delivery_enabled", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/quick-actions.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("isAuthReady");
    expect(source).toContain("if (!isAuthReady) return");
    expect(source).toContain("enabled !== null");
  });
});

describe("entity feature toggles wiring", () => {
  it("refreshes delivery nav after save on settings page", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL(
          "../components/settings/entity-feature-toggles.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(source).toContain("refreshDeliveryNavAfterSave");
    expect(source).toContain('key === "delivery_enabled"');
    expect(source).toContain("refreshDeliveryEnabled");
  });

  it("enables refreshDeliveryNavAfterSave in restaurant settings", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL(
          "../components/settings/restaurant-settings-content.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(source).toContain("refreshDeliveryNavAfterSave");
  });
});
