import { describe, expect, it } from "vitest";

import {
  LEGACY_SETUP_REDIRECTS,
  SETUP_TAB_HREFS,
  WORKSPACE_ROUTES,
} from "@/lib/setup-routes";
import { navSectionForPathname } from "@/lib/nav-sections";

describe("workspace settings navigation", () => {
  it("maps legacy settings and setup URLs to canonical routes", () => {
    expect(LEGACY_SETUP_REDIRECTS["/settings"]).toBe(WORKSPACE_ROUTES.restaurant);
    expect(LEGACY_SETUP_REDIRECTS["/settings/entity"]).toBe(
      WORKSPACE_ROUTES.restaurant,
    );
    expect(LEGACY_SETUP_REDIRECTS["/setup/members"]).toBe(
      WORKSPACE_ROUTES.restaurant,
    );
    expect(LEGACY_SETUP_REDIRECTS["/delivery/platforms"]).toBe(
      WORKSPACE_ROUTES.deliveryPlatforms,
    );
    expect(LEGACY_SETUP_REDIRECTS["/accounting/manual-journals"]).toBe(
      WORKSPACE_ROUTES.manualJournals,
    );
  });

  it("resolves delivery and review section tabs for moved setup pages", () => {
    const delivery = navSectionForPathname("/delivery/platforms");
    expect(delivery?.id).toBe("delivery");
    expect(
      delivery?.tabs.find((tab) => tab.match("/delivery/platforms"))?.label,
    ).toBe("Platforms");

    const review = navSectionForPathname("/review/manual-journals");
    expect(review?.id).toBe("review");
    expect(
      review?.tabs.find((tab) => tab.match("/review/manual-journals"))?.label,
    ).toBe("Manual journals");
  });

  it("exposes canonical workspace href constants", () => {
    expect(SETUP_TAB_HREFS.restaurant).toBe("/settings/restaurant");
    expect(SETUP_TAB_HREFS.accountant).toBe("/review/manual-journals");
    expect(SETUP_TAB_HREFS.openingBalances).toBe("/onboarding/opening-balances");
  });
});
