// @vitest-environment jsdom

/**
 * Accepted-live chrome (left bar + IconSquare) always present.
 * Non-accepted polish stays under [data-theme="v2"] in CSS.
 * ThemeV2Only / ThemeV2OnlyMarker are gone (v2 is the only look).
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Building2, Wallet } from "lucide-react";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { HubTileCard } from "@/components/page/hub-page";
import { StatCard } from "@/components/page/stat-card";
import { ACCEPTED_LIVE_CHROME, THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({
    banks: { accounts: [], balance_kurus: 0 },
    cash: { accounts: [], balance_kurus: 0 },
    credit_cards: { accounts: [], balance_kurus: 0 },
    foreign_currency: {
      usd: { accounts: [] },
      eur: { accounts: [] },
      gbp: { accounts: [] },
    },
  })),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));

afterEach(cleanup);

function expectAcceptedChrome(root: ParentNode) {
  expect(ACCEPTED_LIVE_CHROME.length).toBeGreaterThan(0);
  expect(root.querySelector("[data-accent-bar]")).toBeTruthy();
  expect(root.querySelector("[data-icon-square]")).toBeTruthy();
}

describe("accepted-live chrome", () => {
  it("StatCard has accepted chrome", () => {
    const { container } = render(
      <StatCard label="Sales" icon={Wallet} amountKurus={100_00} />,
    );
    expectAcceptedChrome(container);
  });

  it("HubTileCard has accepted chrome", () => {
    const { container } = render(
      <HubTileCard
        tile={{
          key: "banks",
          href: "/banking/banks",
          icon: Building2,
          title: "Banks",
          amount: "1,00 TL",
        }}
      />,
    );
    expectAcceptedChrome(container);
  });

  it("EntityBalanceSticker has accepted chrome", () => {
    const { container } = render(
      <EntityBalanceSticker
        label="You owe supplier"
        signedBalanceMinor={5_000_00}
      />,
    );
    expectAcceptedChrome(container);
  });

  it("CashBankSnapshotCard has accepted chrome", () => {
    const { container } = render(
      <CashBankSnapshotCard cashKurus={10_00} bankKurus={20_00} />,
    );
    expectAcceptedChrome(container);
  });
});

describe("shared meaning cards under data-theme=v2", () => {
  it("StatCard / HubTileCard / sticker / snapshot keep accepted chrome; no ThemeV2OnlyMarker", () => {
    const { container } = render(
      <div data-theme={THEME_V2_ATTR}>
        <StatCard label="Sales" icon={Wallet} amountKurus={100_00} />
        <HubTileCard
          tile={{
            key: "cash",
            href: "/banking/cash",
            icon: Wallet,
            title: "Cash",
          }}
        />
        <EntityBalanceSticker label="Settled" signedBalanceMinor={0} />
        <CashBankSnapshotCard cashKurus={1} bankKurus={1} />
      </div>,
    );
    expectAcceptedChrome(container);
    expect(container.querySelector("[data-theme-v2-only]")).toBeNull();
    // Column hairline is shared chrome (not a theme fork).
    expect(
      container.querySelector('[data-testid="cash-bank-column-divider"]'),
    ).toBeTruthy();
  });
});

describe("leak mutation + CSS gate", () => {
  it("mutation: hardcode data-theme-v2-only on StatCard → red; restore → green", () => {
    const src = sourceDeclaring("StatCard");
    expect(src).toContain("MeaningCardAccentBar");
    expect(src).toContain("IconSquare");
    expect(src).not.toMatch(/data-theme-v2-only/);
    expect(src).not.toMatch(/THEME_V2_ONLY_ATTR/);
    expect(src).not.toContain("ThemeV2OnlyMarker");

    const leaked = src.replace(
      "data-meaning-card",
      'data-meaning-card data-theme-v2-only=""',
    );
    expect(leaked).toContain("data-theme-v2-only");
    expect(src).not.toContain('data-theme-v2-only=""');
  });

  it("non-accepted sticker/button/segment polish stays under [data-theme=v2] in CSS", () => {
    const css = sourceAt("app/globals.css");
    expect(css).toMatch(
      /\/\* Accepted-live meaning bars[\s\S]*?\[data-meaning-card\]\s*>\s*\[data-accent-bar\][\s\S]*?width:\s*4px/,
    );
    expect(css).toContain(
      '[data-theme="v2"] [data-testid="entity-balance-sticker"] [data-sticker-figure]',
    );
    // Pill radius for variants — must NOT force secondary to white (colour loss).
    expect(css).toContain('[data-theme="v2"] [data-button-variant="secondary"]');
    expect(css).not.toMatch(
      /\[data-button-variant="secondary"\][\s\S]{0,120}#ffffff\s*!important/,
    );
    expect(css).toContain('[data-theme="v2"] [data-stat-figure]');
  });

  it("layout bakes data-theme=v2 unconditionally; no DEFAULT_THEME / THEME_TOGGLE", () => {
    const src = sourceDeclaring("RootLayout");
    expect(src).toContain("data-theme");
    expect(src).toContain("THEME_V2_ATTR");
    expect(src).not.toContain("NEXT_PUBLIC_DEFAULT_THEME");
    expect(src).not.toContain("NEXT_PUBLIC_THEME_TOGGLE");
  });

  it("ThemeV2Only / ThemeV2OnlyMarker / new-look-toggle are gone", () => {
    expect(() => sourceAt("components/ui/theme-v2-gate.tsx")).toThrow();
    expect(() => sourceAt("components/layout/new-look-toggle.tsx")).toThrow();
  });
});
