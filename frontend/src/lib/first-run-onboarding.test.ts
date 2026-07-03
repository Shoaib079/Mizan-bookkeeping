import { describe, expect, it, vi } from "vitest";

import {
  shouldShowFirstRunOnboarding,
  submitFirstRunOnboarding,
} from "./first-run-onboarding";

describe("shouldShowFirstRunOnboarding", () => {
  it("shows modal only when load succeeded with zero entities", () => {
    expect(
      shouldShowFirstRunOnboarding({
        isAuthReady: true,
        entitiesLoading: false,
        entitiesLoaded: true,
        entitiesError: false,
        entityCount: 0,
      }),
    ).toBe(true);
  });

  it("hides modal while loading", () => {
    expect(
      shouldShowFirstRunOnboarding({
        isAuthReady: true,
        entitiesLoading: true,
        entitiesLoaded: false,
        entitiesError: false,
        entityCount: 0,
      }),
    ).toBe(false);
  });

  it("hides modal on load error", () => {
    expect(
      shouldShowFirstRunOnboarding({
        isAuthReady: true,
        entitiesLoading: false,
        entitiesLoaded: false,
        entitiesError: true,
        entityCount: 0,
      }),
    ).toBe(false);
  });

  it("hides modal when user has companies", () => {
    expect(
      shouldShowFirstRunOnboarding({
        isAuthReady: true,
        entitiesLoading: false,
        entitiesLoaded: true,
        entitiesError: false,
        entityCount: 1,
      }),
    ).toBe(false);
  });

  it("hides modal before auth is ready", () => {
    expect(
      shouldShowFirstRunOnboarding({
        isAuthReady: false,
        entitiesLoading: false,
        entitiesLoaded: true,
        entitiesError: false,
        entityCount: 0,
      }),
    ).toBe(false);
  });
});

describe("submitFirstRunOnboarding", () => {
  it("patches display name, creates entity, refreshes, and routes to dashboard", async () => {
    const patchDisplayName = vi.fn(async () => undefined);
    const createEntity = vi.fn(async () => ({ id: "entity-1" }));
    const refreshEntities = vi.fn(async () => undefined);
    const setEntityId = vi.fn();

    await submitFirstRunOnboarding(
      {
        fullName: " Ayşe Yılmaz ",
        businessName: " Kadıköy Cafe ",
        legalName: " Kadıköy Gıda Ltd ",
        vkn: "1234567890",
      },
      {
        clerkEnabled: true,
        patchDisplayName,
        createEntity,
        refreshEntities,
        setEntityId,
      },
    );

    expect(patchDisplayName).toHaveBeenCalledWith("Ayşe Yılmaz");
    expect(createEntity).toHaveBeenCalledWith({
      name: "Kadıköy Cafe",
      vkn: "1234567890",
      legal_name: "Kadıköy Gıda Ltd",
    });
    expect(refreshEntities).toHaveBeenCalledTimes(1);
    expect(setEntityId).toHaveBeenCalledWith("entity-1", {
      redirectToDashboard: true,
    });
  });

  it("skips display-name patch in dev mode and omits blank legal name", async () => {
    const patchDisplayName = vi.fn(async () => undefined);
    const createEntity = vi.fn(async () => ({ id: "entity-2" }));
    const refreshEntities = vi.fn(async () => undefined);
    const setEntityId = vi.fn();

    await submitFirstRunOnboarding(
      {
        fullName: "Dev User",
        businessName: "Dev Cafe",
        legalName: "   ",
        vkn: "1234567890",
      },
      {
        clerkEnabled: false,
        patchDisplayName,
        createEntity,
        refreshEntities,
        setEntityId,
      },
    );

    expect(patchDisplayName).not.toHaveBeenCalled();
    expect(createEntity).toHaveBeenCalledWith({
      name: "Dev Cafe",
      vkn: "1234567890",
    });
  });
});
