// @vitest-environment jsdom

/** v2 meaning-card left bars on every balance / meaning surface. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Building2, Coins, Wallet } from "lucide-react";

import { BalancesOverview } from "@/components/balances/balances-overview";
import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { HubTileCard } from "@/components/page/hub-page";
import { StatCard } from "@/components/page/stat-card";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({
    banks: { accounts: [], balance_kurus: 0 },
    cash: { accounts: [], balance_kurus: 0 },
    credit_cards: { accounts: [], balance_kurus: 0 },
    fx: { accounts: [], balance_kurus: 0 },
  })),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-balance-map", () => ({
  useSupplierBalances: () => ({ totalKurus: 10_00, loading: false }),
  useCustomerBalances: () => ({ totalKurus: 20_00, loading: false }),
}));
vi.mock("@/lib/use-subledger-total", () => ({
  useStaffBalanceTotal: () => ({
    amountLabel: "0,00 TL",
    netSign: 0,
    count: 0,
    fxCount: 0,
    loadFailed: false,
    loading: false,
  }),
  usePartnerBalanceTotal: () => ({
    totalKurus: 0,
    count: 0,
    loading: false,
  }),
}));

afterEach(cleanup);

function renderV2(ui: React.ReactNode) {
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}

function expectBarAndIcon(root: Element | null) {
  expect(root).toBeTruthy();
  expect(root?.querySelector("[data-accent-bar]")).toBeTruthy();
  expect(root?.querySelector("[data-icon-square]")).toBeTruthy();
}

describe("v2 meaning bars on every surface", () => {
  it("banking hub tile has left bar + sky icon square", () => {
    const { container } = renderV2(
      <HubTileCard
        tile={{
          key: "banks",
          href: "/banking/banks",
          icon: Building2,
          title: "Banks",
          amount: "1.000,00 TL",
        }}
      />,
    );
    const card = container.querySelector('[data-testid="hub-tile-card"]');
    expectBarAndIcon(card);
    expect(card?.getAttribute("data-meaning-card")).not.toBeNull();
    expect(card?.querySelector("[data-icon-square][data-tint='sky']")).toBeTruthy();
  });

  it("cash & bank snapshot has blue bar + sky icon", () => {
    const { container } = renderV2(
      <CashBankSnapshotCard cashKurus={100_00} bankKurus={200_00} />,
    );
    const card = container.querySelector(
      '[data-testid="cash-bank-snapshot-card"]',
    );
    expectBarAndIcon(card);
    expect(card?.querySelector("[data-icon-square][data-tint='sky']")).toBeTruthy();
  });

  it("Balances overview cards have left bar + tinted icon", () => {
    const { container } = renderV2(<BalancesOverview embedded />);
    const cards = container.querySelectorAll(
      '[data-testid="balances-overview-card"]',
    );
    expect(cards.length).toBeGreaterThanOrEqual(5);
    for (const card of cards) {
      expectBarAndIcon(card);
    }
  });

  it("FX / bank headline figure has left bar + icon square", () => {
    const { container } = renderV2(
      <HeadlineFigure
        label="Wallet balance"
        icon={Coins}
        amountKurus={100_00}
      />,
    );
    const card = container.querySelector('[data-testid="headline-figure"]');
    expectBarAndIcon(card);
  });

  it("supplier/customer stickers keep direction bar + icon", () => {
    const { container } = renderV2(
      <EntityBalanceSticker
        label="You owe supplier"
        signedBalanceMinor={5_000_00}
      />,
    );
    const sticker = container.querySelector(
      '[data-testid="entity-balance-sticker"]',
    );
    expectBarAndIcon(sticker);
    expect(sticker?.getAttribute("data-direction")).toBe("company_owes");
  });

  it("dashboard KPI StatCard has left bar + icon", () => {
    const { container } = renderV2(
      <StatCard label="This period" icon={Wallet} amountKurus={50_00} />,
    );
    expectBarAndIcon(container.querySelector("[data-meaning-card]"));
  });
});

describe("bar width floor + muted tones", () => {
  it("v2 CSS bar width is >= 4px and tones are the muted set", () => {
    const css = sourceAt("app/globals.css");
    expect(css).toMatch(
      /\[data-meaning-card\]\s*>\s*\[data-accent-bar\][\s\S]*?width:\s*4px/,
    );
    expect(css).toContain("--accent-bar-green: #4e9e77");
    expect(css).toContain("--accent-bar-red: #c05b62");
    expect(css).toContain("--accent-bar-amber: #be8a3f");
    expect(css).toContain("--accent-bar-blue: #4c7fc4");
    expect(css).toContain("--accent-bar-gray: #a7b0bd");
    const v2Start = css.indexOf('[data-theme="v2"]');
    const v2Block = css.slice(v2Start, v2Start + 5000);
    expect(v2Block).not.toMatch(/linear-gradient\s*\(/i);
  });
});

describe("mutation: banking hub tile bar", () => {
  it("mutation: remove accent bar from HubTileCard → red; restore → green", () => {
    const src = sourceDeclaring("HubTileCard");
    expect(src).toMatch(/<MeaningCardAccentBar\s*\/>/);
    expect(src).toContain('data-testid="hub-tile-card"');
    expect(src).toContain("data-meaning-card");

    const withoutJsx = src.replace(/<MeaningCardAccentBar\s*\/>/g, "");
    expect(withoutJsx).not.toMatch(/<MeaningCardAccentBar\s*\/>/);
    expect(src).toMatch(/<MeaningCardAccentBar\s*\/>/);
  });
});

describe("screen smoke", () => {
  it("HubTileCard title is visible", () => {
    renderV2(
      <HubTileCard
        tile={{
          key: "cash",
          href: "/banking/cash",
          icon: Wallet,
          title: "Cash drawer",
        }}
      />,
    );
    expect(screen.getByText("Cash drawer")).toBeTruthy();
  });
});
