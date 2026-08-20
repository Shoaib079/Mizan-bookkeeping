/** Entity balance sticker — compact header figure for partner / staff / supplier. */

import { describe, expect, it } from "vitest";

import {
  balanceStickerDirection,
} from "@/components/entity-balance-sticker";
import { formatTry } from "@/lib/money";
import { sourceDeclaring } from "@/test-support/source";

describe("balanceStickerDirection", () => {
  it("maps sign to colour direction", () => {
    expect(balanceStickerDirection(1)).toBe("company_owes");
    expect(balanceStickerDirection(-1)).toBe("they_owe");
    expect(balanceStickerDirection(0)).toBe("settled");
  });
});

describe("EntityBalanceSticker", () => {
  it("is compact, right-biased, and uses soft direction tokens", () => {
    const src = sourceDeclaring("EntityBalanceSticker");
    expect(src).toContain("max-w-[13rem]");
    expect(src).toContain("sm:ml-auto");
    expect(src).toContain("bg-success-soft");
    expect(src).toContain("bg-destructive-soft");
    expect(src).toContain("bg-muted");
    expect(src).toContain("tabular-nums");
    expect(src).toContain('from "@/lib/money"');
    expect(src).toContain("format(Math.abs(signedBalanceMinor))");
    // No palette literals / hex in the sticker.
    expect(src.match(/#[0-9a-fA-F]{6}/)).toBeNull();
    expect(src.match(/\b(?:bg|text)-(?:red|green|emerald)-\d{3}\b/)).toBeNull();
  });

  it("formats through the shared money helper by default", () => {
    // Guard: default prop must be formatTry — not a local string builder.
    const src = sourceDeclaring("EntityBalanceSticker");
    expect(src).toContain("format = formatTry");
    expect(formatTry(12_345)).toMatch(/123/);
  });
});

describe("detail pages share one sticker", () => {
  const pages = [
    "PartnerDetailPage",
    "StaffDetailPage",
    "SupplierDetailPage",
  ] as const;

  it("each page mounts EntityBalanceSticker and drops the full-width HeadlineFigure", () => {
    for (const page of pages) {
      const src = sourceDeclaring(page);
      expect(src, page).toContain("<EntityBalanceSticker");
      expect(src, page).not.toContain("<HeadlineFigure");
      expect(src, page).toContain("balance={");
      // Net figure once — not also as a headline slot.
      expect(src, page).not.toContain("headline={");
    }
  });

  it("PageHeader places the aside under actions on desktop and under the name on mobile", () => {
    const header = sourceDeclaring("PageHeader");
    expect(header).toContain("aside?: React.ReactNode");
    expect(header).toContain("sm:hidden");
    expect(header).toContain("hidden sm:block");
    expect(header).toContain("sm:items-end");
  });
});
