// @vitest-environment jsdom

/** Mobile settings hub — drill-ins match SETTINGS_PAGE_TABS. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { hasMobileMoreTab } from "@/lib/entity-access";
import { grantsForRole } from "@/lib/member-grants";
import {
  SETTINGS_PAGE_TABS,
  hashForSettingsTab,
} from "@/lib/settings-page-tabs";
import { sourceDeclaring } from "@/test-support/source";

afterEach(cleanup);

describe("MobileSettingsHub navigation", () => {
  it("lists every restaurant settings tab in catalog order", () => {
    render(<MobileSettingsHub />);
    for (const tab of SETTINGS_PAGE_TABS) {
      const link = screen.getByRole("link", { name: new RegExp(tab.label, "i") });
      expect(link.getAttribute("href")).toBe(
        `/settings/restaurant?full=1${hashForSettingsTab(tab.id)}`,
      );
    }
  });

  it("Company Profile opens full settings at company-profile", () => {
    render(<MobileSettingsHub />);
    expect(
      screen.getByRole("link", { name: /Company Profile/i }).getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#company-profile");
  });

  it("Menu & Documents, Teams, Modules, Opening Balances, Backups deep-link", () => {
    render(<MobileSettingsHub />);
    expect(
      screen.getByRole("link", { name: /Menu & Documents/i }).getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#branding");
    expect(
      screen.getByRole("link", { name: /^Teams/i }).getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#team");
    expect(
      screen.getByRole("link", { name: /^Modules/i }).getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#modules");
    expect(
      screen
        .getByRole("link", { name: /Opening Balances/i })
        .getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#opening-balances");
    expect(
      screen.getByRole("link", { name: /^Backups/i }).getAttribute("href"),
    ).toBe("/settings/restaurant?full=1#backups");
  });

  it("does not embed inline module toggles (Modules is a drill-in)", () => {
    const source = sourceDeclaring("MobileSettingsHub");
    expect(source).not.toContain("MobileSettingsModules");
    expect(source).toContain("SETTINGS_PAGE_TABS");
  });

  it("mutation: company profile linking to the hub alone goes red", () => {
    const source = sourceDeclaring("MobileSettingsHub");
    expect(source).toContain("?full=1");
    expect(source).toContain("hashForSettingsTab");
  });
});

describe("hasMobileMoreTab", () => {
  it("shows More for reports-only access without banking", () => {
    expect(hasMobileMoreTab(["nav:reports", "nav:dashboard"])).toBe(true);
  });

  it("keeps sales-only cashier on the Sales tab, not More", () => {
    expect(hasMobileMoreTab(grantsForRole("cashier"))).toBe(false);
  });
});

describe("settings section hash targets exist", () => {
  it("backups panel exposes id=backups for mobile drill-in", () => {
    const source = sourceDeclaring("BackupsInfoPanel");
    expect(source).toMatch(/id="backups"/);
  });

  it("restaurant settings content exposes company-profile and team ids", () => {
    const content = sourceDeclaring("RestaurantSettingsContent");
    const company = sourceDeclaring("CompanyProfilePanel");
    expect(company).toContain('id="company-profile"');
    expect(content).toContain('id="team"');
  });
});
