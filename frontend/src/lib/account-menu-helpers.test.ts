/** Account menu helpers — Slice 12.0b. */

import { describe, expect, it } from "vitest";

import {
  devModeIdentityLabel,
  discardChangesMessage,
  discardChangesTitle,
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

describe("discard changes copy", () => {
  it("warns before leaving with dirty forms", () => {
    expect(discardChangesMessage()).toContain("not been saved");
    expect(discardChangesTitle()).toContain("Discard");
  });
});

describe("unsavedWorkWarningMessage", () => {
  it("warns before leaving with dirty forms", () => {
    expect(unsavedWorkWarningMessage()).toContain("not been saved");
  });
});

describe("recordingForLabel", () => {
  it("includes the active restaurant name", () => {
    expect(recordingForLabel("Bodrum Bistro")).toBe(
      "Recording for: Bodrum Bistro",
    );
  });
});

describe("devModeIdentityLabel", () => {
  it("states dev mode when Clerk auth is off", () => {
    expect(devModeIdentityLabel()).toBe("Dev mode — not signed in");
  });
});
