import { describe, expect, it, vi } from "vitest";

import {
  ENTITY_FETCH_MAX_ATTEMPTS,
  ENTITY_FETCH_RETRY_DELAY_MS,
  fetchEntitiesWithRetry,
  shouldShowCreateRestaurantPrompt,
} from "./entity-context-helpers";

describe("shouldShowCreateRestaurantPrompt", () => {
  it("shows register prompt only when load succeeded with zero entities", () => {
    expect(
      shouldShowCreateRestaurantPrompt({
        entitiesLoading: false,
        entitiesLoaded: true,
        entitiesError: false,
        entityCount: 0,
      }),
    ).toBe(true);
  });

  it("hides register prompt while loading", () => {
    expect(
      shouldShowCreateRestaurantPrompt({
        entitiesLoading: true,
        entitiesLoaded: false,
        entitiesError: false,
        entityCount: 0,
      }),
    ).toBe(false);
  });

  it("hides register prompt on load error", () => {
    expect(
      shouldShowCreateRestaurantPrompt({
        entitiesLoading: false,
        entitiesLoaded: false,
        entitiesError: true,
        entityCount: 0,
      }),
    ).toBe(false);
  });

  it("hides register prompt when user has companies", () => {
    expect(
      shouldShowCreateRestaurantPrompt({
        entitiesLoading: false,
        entitiesLoaded: true,
        entitiesError: false,
        entityCount: 2,
      }),
    ).toBe(false);
  });
});

describe("fetchEntitiesWithRetry", () => {
  it("retries failed fetches before giving up", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("auth not ready"))
      .mockRejectedValueOnce(new Error("auth not ready"))
      .mockResolvedValue({ items: [{ id: "e1", name: "Cafe" }] });

    const result = await fetchEntitiesWithRetry(fetchOnce, {
      maxAttempts: ENTITY_FETCH_MAX_ATTEMPTS,
      delayMs: ENTITY_FETCH_RETRY_DELAY_MS,
      sleep,
    });

    expect(result.items).toHaveLength(1);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    const fetchOnce = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      fetchEntitiesWithRetry(fetchOnce, {
        maxAttempts: 3,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("network down");
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });
});
