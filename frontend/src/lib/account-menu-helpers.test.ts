/** Account menu helpers — Slice 12.0b. */

import { describe, expect, it } from "vitest";

import {
  accountMenuAdminLinks,
  recordingForLabel,
  switchConfirmMessage,
  unsavedWorkWarningMessage,
} from "./account-menu-helpers";

describe("switchConfirmMessage", () => {
  it("names both restaurants in the confirm copy", () => {
    expect(switchConfirmMessage("Bodrum", "Ankara")).toBe(
      "Switch to Ankara? You're currently in Bodrum.",
    );
  });
});

describe("unsavedWorkWarningMessage", () => {
  it("warns before leaving with dirty forms", () => {
    expect(unsavedWorkWarningMessage()).toContain("unsaved");
  });
});

describe("accountMenuAdminLinks", () => {
  it("shows all admin links for owners", () => {
    const links = accountMenuAdminLinks("owner");
    expect(links.map((link) => link.href)).toEqual([
      "/settings/entity",
      "/settings/opening-balances",
      "/settings/members",
    ]);
  });

  it("hides admin links for cashiers", () => {
    expect(accountMenuAdminLinks("cashier")).toEqual([]);
  });

  it("hides admin links for view-only partners", () => {
    expect(accountMenuAdminLinks("partner_view_only")).toEqual([]);
  });
});

describe("recordingForLabel", () => {
  it("includes the active restaurant name", () => {
    expect(recordingForLabel("Bodrum Bistro")).toBe(
      "Recording for: Bodrum Bistro",
    );
  });
});
