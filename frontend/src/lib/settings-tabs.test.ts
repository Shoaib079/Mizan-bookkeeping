/** Guards for restaurant settings tabbed layout (`v0.settings-tabs`). */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS_PAGE_TAB,
  SETTINGS_PAGE_TABS,
  hashForSettingsTab,
  settingsTabFromHash,
} from "@/lib/settings-page-tabs";
import { sourceDeclaring } from "@/test-support/source";

describe("settings page tabs catalog", () => {
  it("lists six restaurant-settings tabs in the owner-specified order", () => {
    expect(SETTINGS_PAGE_TABS.map((t) => t.label)).toEqual([
      "Company Profile",
      "Menu & Documents",
      "Teams",
      "Modules",
      "Opening Balances",
      "Backups",
    ]);
    expect(SETTINGS_PAGE_TABS.map((t) => t.id)).not.toContain("profile");
  });

  it("maps mobile hashes onto the matching tab", () => {
    expect(settingsTabFromHash("#company-profile")).toBe("company");
    expect(settingsTabFromHash("branding")).toBe("menu");
    expect(settingsTabFromHash("#team")).toBe("teams");
    expect(settingsTabFromHash("#modules")).toBe("modules");
    expect(settingsTabFromHash("#opening-balances")).toBe("opening");
    expect(settingsTabFromHash("#backups")).toBe("backups");
    expect(settingsTabFromHash("#profile")).toBeNull();
    expect(settingsTabFromHash("")).toBeNull();
    expect(DEFAULT_SETTINGS_PAGE_TAB).toBe("company");
    expect(hashForSettingsTab("teams")).toBe("#team");
  });
});

describe("RestaurantSettingsContent tabbed layout", () => {
  it("renders SettingsPageTabs and keeps every section behind a tab", () => {
    const src = sourceDeclaring("RestaurantSettingsContent");
    expect(src).toContain("SettingsPageTabs");
    expect(src).toContain("CompanyProfilePanel");
    expect(src).toContain("RestaurantBrandingPanel");
    expect(src).toContain("TeamPanel");
    expect(src).toContain("EntityFeatureToggles");
    expect(src).toContain("BackupsInfoPanel");
    expect(src).toContain("DeleteRestaurantPanel");
    expect(src).not.toContain('href="/settings/profile"');
    expect(src).not.toContain("Manage your profile →");
    expect(src).not.toContain('activeTab === "profile"');
    expect(src).toContain('id="team"');
    expect(sourceDeclaring("CompanyProfilePanel")).toContain(
      'id="company-profile"',
    );
    expect(src).toContain('activeTab === "menu"');
    expect(src).toContain('activeTab === "teams"');
  });

  it("keeps delete restaurant below the tab panels", () => {
    const src = sourceDeclaring("RestaurantSettingsContent");
    const tabsJsx = src.lastIndexOf("<SettingsPageTabs");
    const delJsx = src.lastIndexOf("<DeleteRestaurantPanel");
    expect(tabsJsx).toBeGreaterThan(-1);
    expect(delJsx).toBeGreaterThan(tabsJsx);
  });

  it("does not stack all sections as a single long scroll of FormSections", () => {
    const src = sourceDeclaring("RestaurantSettingsContent");
    expect(src).toContain("activeTab ===");
    expect(src).not.toMatch(
      /CompanyProfilePanel[\s\S]*RestaurantBrandingPanel[\s\S]*EntityFeatureToggles[\s\S]*TeamPanel/,
    );
  });
});

describe("SettingsPageTabs chrome", () => {
  it("uses the larger tab padding from UX polish", () => {
    const src = sourceDeclaring("SettingsPageTabs");
    expect(src).toContain("px-4 py-2.5 text-base");
    expect(src).toContain('role="tablist"');
    expect(src).toContain("SETTINGS_PAGE_TABS");
  });
});
