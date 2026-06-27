import { describe, expect, it } from "vitest";

import {
  buildOnboardingSteps,
  deriveOnboardingState,
  isOnboardingComplete,
  onboardingDismissStorageKey,
  shouldShowOnboardingChecklist,
} from "@/lib/onboarding";

describe("shouldShowOnboardingChecklist", () => {
  it("shows for owner and partner", () => {
    expect(shouldShowOnboardingChecklist("owner")).toBe(true);
    expect(shouldShowOnboardingChecklist("partner")).toBe(true);
  });

  it("hides for cashier and partner_view_only", () => {
    expect(shouldShowOnboardingChecklist("cashier")).toBe(false);
    expect(shouldShowOnboardingChecklist("partner_view_only")).toBe(false);
  });
});

describe("deriveOnboardingState", () => {
  it("marks steps done from paginated totals", () => {
    expect(
      deriveOnboardingState({
        openingBalance: { total: 0 },
        members: { total: 1 },
        dailySummaries: { total: 0 },
      }),
    ).toEqual({
      openingBalancesPosted: false,
      staffInvited: false,
      firstDayRecorded: false,
    });
  });

  it("treats more than one member as staff invited", () => {
    expect(
      deriveOnboardingState({
        openingBalance: { total: 1 },
        members: { total: 2 },
        dailySummaries: { total: 3 },
      }).staffInvited,
    ).toBe(true);
  });
});

describe("buildOnboardingSteps", () => {
  const freshState = {
    openingBalancesPosted: false,
    staffInvited: false,
    firstDayRecorded: false,
  };

  it("includes invite staff only for admin:manage_members roles", () => {
    const ownerSteps = buildOnboardingSteps(freshState, "owner");
    expect(ownerSteps.map((step) => step.id)).toEqual([
      "opening_balances",
      "invite_staff",
      "first_day",
    ]);

    const cashierSteps = buildOnboardingSteps(freshState, "cashier");
    expect(cashierSteps.map((step) => step.id)).toEqual([
      "opening_balances",
      "first_day",
    ]);
  });

  it("marks completed steps as done", () => {
    const steps = buildOnboardingSteps(
      {
        openingBalancesPosted: true,
        staffInvited: false,
        firstDayRecorded: false,
      },
      "owner",
    );
    expect(steps.filter((step) => step.done).map((step) => step.id)).toEqual([
      "opening_balances",
    ]);
  });

  it("links first day to sales", () => {
    const step = buildOnboardingSteps(freshState, "owner").find(
      (item) => item.id === "first_day",
    );
    expect(step?.href).toBe("/sales");
  });
});

describe("isOnboardingComplete", () => {
  it("is true only when every step is done", () => {
    const steps = buildOnboardingSteps(
      {
        openingBalancesPosted: true,
        staffInvited: true,
        firstDayRecorded: true,
      },
      "owner",
    );
    expect(isOnboardingComplete(steps)).toBe(true);
    expect(
      isOnboardingComplete(
        buildOnboardingSteps(
          {
            openingBalancesPosted: false,
            staffInvited: false,
            firstDayRecorded: false,
          },
          "owner",
        ),
      ),
    ).toBe(false);
  });
});

describe("onboardingDismissStorageKey", () => {
  it("scopes dismiss state per entity", () => {
    expect(onboardingDismissStorageKey("abc")).toBe("mizan.onboarding.dismissed.abc");
  });
});
