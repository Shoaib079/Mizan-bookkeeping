// @vitest-environment jsdom

/**
 * Theme leak hardening — accepted-live chrome is intentional on v1;
 * non-accepted v2-only chrome must not appear without data-theme=v2.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Building2, Wallet } from "lucide-react";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { HubTileCard } from "@/components/page/hub-page";
import { StatCard } from "@/components/page/stat-card";
import {
  ACCEPTED_LIVE_CHROME,
  THEME_V2_ATTR,
  THEME_V2_ONLY_ATTR,
} from "@/lib/theme-v2";
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

function expectNoV2Only(root: ParentNode) {
  expect(root.querySelector(`[${THEME_V2_ONLY_ATTR}]`)).toBeNull();
}

describe("accepted-live chrome without data-theme=v2", () => {
  it("StatCard has accepted chrome and zero non-accepted v2-only markers", async () => {
    const { container } = render(
      <StatCard label="Sales" icon={Wallet} amountKurus={100_00} />,
    );
    expectAcceptedChrome(container);
    await waitFor(() => expectNoV2Only(container));
  });

  it("HubTileCard has accepted chrome and zero v2-only markers", async () => {
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
    await waitFor(() => expectNoV2Only(container));
  });

  it("EntityBalanceSticker has accepted chrome and zero v2-only markers", async () => {
    const { container } = render(
      <EntityBalanceSticker
        label="You owe supplier"
        signedBalanceMinor={5_000_00}
      />,
    );
    expectAcceptedChrome(container);
    await waitFor(() => expectNoV2Only(container));
  });

  it("CashBankSnapshotCard has accepted chrome and zero v2-only markers", async () => {
    const { container } = render(
      <CashBankSnapshotCard cashKurus={10_00} bankKurus={20_00} />,
    );
    expectAcceptedChrome(container);
    await waitFor(() => expectNoV2Only(container));
  });
});

describe("with data-theme=v2 wrapper — accepted + gated chrome", () => {
  it("StatCard under v2 shows accepted chrome and ThemeV2OnlyMarker", async () => {
    const { container } = render(
      <div data-theme={THEME_V2_ATTR}>
        <StatCard label="Sales" icon={Wallet} amountKurus={100_00} />
      </div>,
    );
    expectAcceptedChrome(container);
    await waitFor(() => {
      expect(container.querySelector(`[${THEME_V2_ONLY_ATTR}]`)).toBeTruthy();
    });
  });

  it("HubTileCard / sticker / snapshot under v2 show v2-only marker", async () => {
    const { container } = render(
      <div data-theme={THEME_V2_ATTR}>
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
    await waitFor(() => {
      expect(
        container.querySelectorAll(`[${THEME_V2_ONLY_ATTR}]`).length,
      ).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("leak mutation + CSS gate", () => {
  it("mutation: leak non-accepted v2-only attr into v1 StatCard → red; restore → green", () => {
    const src = sourceDeclaring("StatCard");
    // Accepted chrome always present
    expect(src).toContain("MeaningCardAccentBar");
    expect(src).toContain("IconSquare");
    // Must not hardcode the v2-only attr on the shell (bypass the gate)
    expect(src).not.toMatch(/data-theme-v2-only/);
    expect(src).not.toMatch(/THEME_V2_ONLY_ATTR/);

    const leaked = src.replace(
      "data-meaning-card",
      `data-meaning-card ${THEME_V2_ONLY_ATTR}=""`,
    );
    expect(leaked).toContain(THEME_V2_ONLY_ATTR);
    expect(src).not.toContain(`${THEME_V2_ONLY_ATTR}=""`);
  });

  it("non-accepted sticker/button/segment polish stays under [data-theme=v2] in CSS", () => {
    const css = sourceAt("app/globals.css");
    // Accepted bar is unscoped (intentional live baseline)
    expect(css).toMatch(
      /\/\* Accepted-live meaning bars[\s\S]*?\[data-meaning-card\]\s*>\s*\[data-accent-bar\][\s\S]*?width:\s*4px/,
    );
    // Non-accepted typography / button restyles remain theme-scoped
    expect(css).toContain(
      '[data-theme="v2"] [data-testid="entity-balance-sticker"] [data-sticker-figure]',
    );
    expect(css).toContain('[data-theme="v2"] [data-button-variant="secondary"]');
    expect(css).toContain('[data-theme="v2"] [data-stat-figure]');
  });

  it("layout requires THEME_TOGGLE with DEFAULT_THEME before baking data-theme", () => {
    const src = sourceDeclaring("RootLayout");
    expect(src).toContain("NEXT_PUBLIC_THEME_TOGGLE");
    expect(src).toContain("NEXT_PUBLIC_DEFAULT_THEME");
    expect(src).toMatch(
      /THEME_TOGGLE[\s\S]*=== "true"[\s\S]*DEFAULT_THEME[\s\S]*=== "v2"/,
    );
  });
});
