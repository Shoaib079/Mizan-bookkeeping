/** Account menu helpers — Slice 12.0b. */

import { describe, expect, it } from "vitest";

import {
  devModeIdentityLabel,
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
