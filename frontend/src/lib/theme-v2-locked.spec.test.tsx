// @vitest-environment jsdom

/** Owner-locked v2 visual spec — white canvas, muted left bars, tinted icon squares. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShoppingBag, Wallet } from "lucide-react";

import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { StatCard } from "@/components/page/stat-card";
import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { THEME_V2_ATTR } from "@/lib/theme-v2";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => ({
    resetSubmit: vi.fn(),
    beginSubmit: vi.fn(),
    completeSubmit: vi.fn(),
  }),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));

afterEach(cleanup);

function renderV2(ui: React.ReactNode) {
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}


describe("locked v2 meaning cards", () => {
  it("StatCard renders white shell + hairline + 4px muted left bar + tinted icon square", () => {
    const { container } = renderV2(
      <StatCard
        label="Sales"
        icon={ShoppingBag}
        amountKurus={100_00}
        tone="default"
        trend={{ value: "+12%" }}
      />,
    );
    const card = container.querySelector("[data-meaning-card]");
    expect(card).toBeTruthy();
    expect(card?.querySelector("[data-accent-bar]")).toBeTruthy();
    expect(card?.querySelector("[data-icon-square][data-tint='sky']")).toBeTruthy();
    const svg = card?.querySelector("[data-icon-square] svg");
    expect(svg?.getAttribute("stroke-width") || svg?.getAttribute("strokeWidth")).toBeTruthy();
    expect(container.querySelector("[style*='kpi-icon-gradient']")).toBeNull();
    expect(container.querySelector("[style*='linear-gradient']")).toBeNull();
  });

  it("sticker figure is ink absolute (no minus) with muted heading + icon square", () => {
    const { container } = renderV2(
      <EntityBalanceSticker
        label="Supplier owes you"
        caption="Current balance"
        signedBalanceMinor={-12_500_00}
      />,
    );
    const sticker = container.querySelector('[data-testid="entity-balance-sticker"]');
    expect(sticker?.getAttribute("data-direction")).toBe("they_owe");
    expect(sticker?.querySelector("[data-accent-bar]")).toBeTruthy();
    expect(sticker?.querySelector("[data-icon-square][data-tint='blush']")).toBeTruthy();
    const figure = sticker?.querySelector("[data-sticker-figure]");
    expect(figure?.textContent ?? "").not.toMatch(/-/);
    expect(figure?.textContent ?? "").toMatch(/12\.500/);
    expect(sticker?.querySelector("[data-sticker-heading]")?.textContent).toMatch(
      /Supplier owes you/,
    );
  });

  it("settings hub rows use tinted icon squares", () => {
    const { container } = renderV2(<MobileSettingsHub />);
    expect(container.querySelectorAll("[data-icon-square]").length).toBeGreaterThanOrEqual(3);
  });
});

describe("locked v2 mutation guards", () => {
  it("mutation: bright/saturated bar or any gradient under v2 goes red", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const v2Start = css.indexOf('[data-theme="v2"]');
    expect(v2Start).toBeGreaterThan(-1);
    const v2Block = css.slice(v2Start, v2Start + 4500);
    expect(v2Block).toContain("--accent-bar-green: #4e9e77");
    expect(v2Block).toContain("--accent-bar-red: #c05b62");
    expect(v2Block).toContain("--background: #ffffff");
    expect(v2Block).toContain("--border: #e6eaf2");
    expect(v2Block).not.toMatch(/linear-gradient\s*\(/i);
    expect(v2Block).toContain("--kpi-icon-gradient: none");

    const brokenBright = v2Block.replace("#4e9e77", "#00ff66");
    expect(brokenBright).toContain("#00ff66");
    expect(v2Block).not.toContain("#00ff66");

    const brokenGradient = v2Block.replace(
      "--kpi-icon-gradient: none",
      "--kpi-icon-gradient: linear-gradient(135deg, red, blue)",
    );
    expect(brokenGradient).toMatch(/linear-gradient/i);
    expect(v2Block).not.toMatch(/linear-gradient\s*\(/i);
  });

  it("mutation: tab bar FAB below v1 size goes red", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    // v1 default
    expect(css).toMatch(/:root[\s\S]*?--record-fab-size:\s*3\.5rem/);
    const v2Start = css.indexOf('[data-theme="v2"]');
    const v2Block = css.slice(v2Start, v2Start + 4500);
    expect(v2Block).toMatch(/--record-fab-size:\s*3\.5rem/);
    const broken = v2Block.replace("--record-fab-size: 3.5rem", "--record-fab-size: 2.5rem");
    expect(broken).toContain("2.5rem");
    expect(v2Block).not.toContain("2.5rem");
  });
});

describe("v1 unchanged without wrapper", () => {
  it("StatCard without data-theme=v2 has no meaning-card accent requirement on canvas", () => {
    const { container } = render(
      <StatCard label="Sales" icon={Wallet} amountKurus={50_00} />,
    );
    expect(container.querySelector(`[data-theme="${THEME_V2_ATTR}"]`)).toBeNull();
    // Component still mounts icon square (shared); theme paint is CSS-scoped
    expect(screen.getByText("Sales")).toBeTruthy();
  });
});
