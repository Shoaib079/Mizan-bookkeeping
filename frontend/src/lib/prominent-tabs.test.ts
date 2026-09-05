import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

/** Prominent tab track + filter chips — all section pages share this chrome. */
describe("prominent tabs and filter chips", () => {
  it("SectionTabs and SettingsPageTabs use tab-track tokens", () => {
    const section = sourceDeclaring("SectionTabs");
    const settings = sourceDeclaring("SettingsPageTabs");
    expect(section).toContain("TAB_TRACK_SCROLL");
    expect(section).toContain("tabTrackItemClass");
    expect(settings).toContain("TAB_TRACK_WRAP");
    expect(settings).toContain("tabTrackItemClass");
  });

  it("tab track matches SegmentedControl active tokens", () => {
    const track = sourceAt("lib/tab-track.ts");
    const segment = sourceDeclaring("SegmentedControl");
    expect(track).toContain("--segment-active-bg");
    expect(track).toContain("--segment-active-fg");
    expect(track).toContain("MOBILE_TOUCH_TARGET");
    expect(segment).toContain("--segment-active-bg");
  });

  it("delivery platform filter and record payment use shared chip/segment chrome", () => {
    const delivery = sourceDeclaring("DeliveryPlatformFilter");
    expect(delivery).toContain("FilterChips");
    expect(delivery).not.toContain("border-border bg-card text-muted-foreground");

    const payment = sourceDeclaring("RecordPaymentPanel");
    expect(payment).toContain("SegmentedControl");
    expect(payment).not.toContain("record-payment-tab-");
  });
});
