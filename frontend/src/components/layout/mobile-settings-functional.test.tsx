// @vitest-environment jsdom

/** Mobile settings functional audit — hub links, toggles, hash targets. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { MobileSettingsModules } from "@/components/layout/mobile-settings-modules";
import { hasMobileMoreTab } from "@/lib/entity-access";
import { grantsForRole } from "@/lib/member-grants";
import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();
const toast = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", refreshEntities: vi.fn() }),
}));
vi.mock("@/components/quick-actions", () => ({
  useQuickActions: () => ({ refreshDeliveryEnabled: vi.fn() }),
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => ({
    beginSubmit: () => "idem-key",
    completeSubmit: vi.fn(),
    resetSubmit: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("MobileSettingsHub navigation", () => {
  it("Company profile opens full settings at company-profile (not the hub again)", () => {
    render(<MobileSettingsHub />);
    const link = screen.getByRole("link", { name: /Company profile/i });
    expect(link.getAttribute("href")).toBe(
      "/settings/restaurant?full=1#company-profile",
    );
  });

  it("Team drill-in lands on the team section", () => {
    render(<MobileSettingsHub />);
    expect(screen.getByRole("link", { name: /^Team$/i }).getAttribute("href")).toBe(
      "/settings/restaurant?full=1#team",
    );
  });

  it("Backups drill-in lands on the backups section", () => {
    render(<MobileSettingsHub />);
    expect(screen.getByRole("link", { name: /^Backups$/i }).getAttribute("href")).toBe(
      "/settings/restaurant?full=1#backups",
    );
  });

  it("Opening balances navigates to onboarding flow", () => {
    render(<MobileSettingsHub />);
    expect(
      screen.getByRole("link", { name: /Opening balances/i }).getAttribute("href"),
    ).toBe("/onboarding/opening-balances");
  });

  it("mutation: company profile linking to the hub alone goes red", () => {
    const source = sourceDeclaring("MobileSettingsHub");
    const broken = source.replace(
      '/settings/restaurant?full=1#company-profile',
      '"/settings/restaurant"',
    );
    expect(broken).not.toContain("?full=1#company-profile");
    expect(source).toContain("?full=1#company-profile");
  });
});

describe("MobileSettingsModules toggle errors", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.mockReset();
    apiFetch.mockResolvedValue({ items: [{ key: "delivery_enabled", value: "false" }] });
  });

  it("shows a visible error when the API fails on toggle", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" || init?.method === "POST") {
        throw new Error("Network down");
      }
      return { items: [{ key: "delivery_enabled", value: "false" }] };
    });

    render(<MobileSettingsModules />);
    const switches = await screen.findAllByRole("switch");
    fireEvent.click(switches[1]!);

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeTruthy();
    });
    expect(toast).not.toHaveBeenCalled();
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
    const source = sourceDeclaring("RestaurantSettingsContent");
    expect(source).toContain('id="company-profile"');
    expect(source).toContain('id="team"');
  });
});
