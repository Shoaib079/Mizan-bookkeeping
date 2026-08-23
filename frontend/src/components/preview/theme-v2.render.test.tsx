// @vitest-environment jsdom

/** Interactive /preview phone walkthrough — tabs, drill-in, zero API/router. */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ThemePreviewPage from "@/app/preview/page";
import { StatCard } from "@/components/page/stat-card";
import { MeaningChip } from "@/components/ui/meaning-chip";
import { ThemePreviewGallery } from "@/components/preview/theme-preview-gallery";
import { canAccessThemePreview } from "@/lib/entity-access";
import {
  previewTabHref,
  selectPreviewTab,
  type PreviewTab,
} from "@/lib/preview-nav";
import { sourceDeclaring } from "@/test-support/source";
import type { EntityRole } from "@/lib/settings-types";
import { THEME_V2_ATTR } from "@/lib/theme-v2";
import { ShoppingBag } from "lucide-react";

const accessState: { role: EntityRole; membershipSettled: boolean } = {
  role: "owner",
  membershipSettled: true,
};

const routerPush = vi.fn();
const apiFetch = vi.fn(async () => ({ items: [] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/preview",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    role: accessState.role,
    grants: [],
    membershipSettled: accessState.membershipSettled,
    loading: false,
    canWriteOperations: accessState.role === "owner",
    canWriteDailyTransactions: true,
    canReadFinancialReports: false,
    canReadReports: false,
    canAccessSettings: false,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/quick-actions", () => ({
  useQuickActions: () => ({ refreshDeliveryEnabled: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  apiFetch,
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
vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => true,
}));

beforeEach(() => {
  accessState.role = "owner";
  accessState.membershipSettled = true;
  routerPush.mockReset();
  apiFetch.mockClear();
});

afterEach(cleanup);

function clickTab(label: string) {
  const bar = screen.getByRole("navigation", { name: "Preview tab bar" });
  fireEvent.click(within(bar).getByText(label));
}

describe("theme v2 token scope", () => {
  it("StatCard icon chip uses locked tinted square under data-theme=v2 (no gradient)", () => {
    const { container } = render(
      <div data-theme={THEME_V2_ATTR}>
        <StatCard
          label="Sales"
          icon={ShoppingBag}
          amountKurus={100_00}
          trend={{ value: "+12%" }}
        />
      </div>,
    );
    const square = container.querySelector("[data-icon-square]");
    expect(square).toBeTruthy();
    expect(container.querySelector(`[data-theme="${THEME_V2_ATTR}"]`)).toBeTruthy();
    expect(container.querySelector("[style*='kpi-icon-gradient']")).toBeNull();
    expect(container.querySelector("[style*='linear-gradient']")).toBeNull();
  });

  it("StatCard renders without v2 theme wrapper on v1", () => {
    const { container } = render(
      <StatCard
        label="Sales"
        icon={ShoppingBag}
        amountKurus={100_00}
        trend={{ value: "+12%" }}
      />,
    );
    expect(container.querySelector(`[data-theme="${THEME_V2_ATTR}"]`)).toBeNull();
    expect(screen.getByText("+12%")).toBeTruthy();
  });

  it("MeaningChip exposes semantic tone data attribute", () => {
    render(<MeaningChip tone="in">Cash in</MeaningChip>);
    expect(screen.getByText("Cash in").closest("[data-meaning-chip='in']")).toBeTruthy();
  });

  it("ThemePreviewGallery mounts under data-theme=v2", () => {
    const { container } = render(<ThemePreviewGallery />);
    expect(container.querySelector(".theme-v2-gallery[data-theme='v2']")).toBeTruthy();
    expect(screen.getByText(/Mobile visual refresh v2/)).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
  });
});

describe("interactive preview tabs and drill-in", () => {
  it("tapping each tab renders that screen", () => {
    render(<ThemePreviewGallery />);
    expect(document.querySelector('[data-preview-screen="home"]')).toBeTruthy();

    clickTab("Sales");
    expect(document.querySelector('[data-preview-screen="sales"]')).toBeTruthy();

    clickTab("Balances");
    expect(document.querySelector('[data-preview-screen="balances"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(document.querySelector('[data-preview-screen="record"]')).toBeTruthy();

    clickTab("More");
    expect(document.querySelector('[data-preview-screen="more"]')).toBeTruthy();

    clickTab("Home");
    expect(document.querySelector('[data-preview-screen="home"]')).toBeTruthy();
  });

  it("sales drill-in and back work", () => {
    render(<ThemePreviewGallery />);
    clickTab("Sales");
    fireEvent.click(screen.getByText("05.08.2026"));
    expect(document.querySelector('[data-preview-screen="sale-detail"]')).toBeTruthy();
    expect(screen.getByText(/Daily sales · 05\.08\.2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(document.querySelector('[data-preview-screen="sales"]')).toBeTruthy();
  });

  it("void sheet opens and closes without posting", () => {
    render(<ThemePreviewGallery />);
    clickTab("Balances");
    fireEvent.click(screen.getByText("Metro Gıda Toptan"));
    expect(document.querySelector('[data-preview-screen="supplier-detail"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(PREVIEW_VOID_SNIPPET)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("void confirm shows preview-only hint and posts nothing", () => {
    render(<ThemePreviewGallery />);
    clickTab("Balances");
    fireEvent.click(screen.getByText("Metro Gıda Toptan"));
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Void" }));
    expect(screen.getByRole("status").textContent ?? "").toMatch(/preview only/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("record chip tap shows preview-only hint", () => {
    render(<ThemePreviewGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    fireEvent.click(screen.getByRole("tab", { name: /Daily expenses/i }));
    expect(screen.getByRole("status").textContent ?? "").toMatch(/preview only/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("more toggles flip locally without API", () => {
    render(<ThemePreviewGallery />);
    clickTab("More");
    const delivery = screen.getByRole("switch", { name: "Delivery" });
    expect(delivery.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(delivery);
    expect(delivery.getAttribute("aria-checked")).toBe("false");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

const PREVIEW_VOID_SNIPPET = "05.08.2026 · Invoice · 12.450,00 ₺";

describe("preview makes zero apiFetch calls", () => {
  it("mount and interactions never call apiFetch", () => {
    render(<ThemePreviewGallery />);
    clickTab("Sales");
    clickTab("Balances");
    fireEvent.click(screen.getByText("Acme Agency"));
    expect(screen.getByText(/Veg Menu 1 · 10 pax × \$12,00 — deposit paid/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    clickTab("More");
    fireEvent.click(screen.getByRole("button", { name: /Company profile/i }));
    expect(screen.getByRole("status").textContent ?? "").toMatch(/preview only/i);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(0);
  });
});

describe("preview never invokes the real router", () => {
  it("tab switches leave next/navigation push unused", () => {
    render(<ThemePreviewGallery />);
    clickTab("Sales");
    clickTab("Balances");
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    clickTab("More");
    clickTab("Home");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("selectPreviewTab ignores router.push", () => {
    const setTab = vi.fn();
    const push = vi.fn();
    selectPreviewTab("sales", setTab, { push });
    expect(setTab).toHaveBeenCalledWith("sales");
    expect(push).not.toHaveBeenCalled();
  });

  it("mutation: wiring a tab to the real router goes red", () => {
    const tabBarSrc = sourceDeclaring("PreviewTabBar");
    expect(tabBarSrc).toContain("selectPreviewTab");
    expect(tabBarSrc).not.toMatch(/useRouter|router\.push/);

    const navSrc = sourceDeclaring("selectPreviewTab");
    expect(navSrc).toContain("void router");
    const broken = navSrc.replace(
      "void router;\n  setTab(tab);",
      "router?.push(previewTabHref(tab));\n  setTab(tab);",
    );
    expect(broken).toContain("router?.push");
    expect(broken).not.toContain("void router");

    // Runtime proof that broken wiring would call push
    const push = vi.fn();
    const setTab = vi.fn();
    function brokenSelect(
      tab: PreviewTab,
      set: (t: PreviewTab) => void,
      router?: { push: (href: string) => void },
    ) {
      router?.push(previewTabHref(tab));
      set(tab);
    }
    brokenSelect("sales", setTab, { push });
    expect(push).toHaveBeenCalledWith("/sales");
    push.mockClear();
    selectPreviewTab("sales", setTab, { push });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("preview balance sticker samples", () => {
  it("renders direction headings and no minus on they-owe samples", () => {
    const { container } = render(<ThemePreviewGallery />);
    clickTab("Balances");

    expect(screen.getAllByText("You owe supplier").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Supplier owes you")).toBeTruthy();
    expect(screen.getAllByText("Settled").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Owed in USD")).toBeTruthy();
    expect(screen.getByText("Supplier detail")).toBeTruthy();
    expect(screen.getByText("Customer detail")).toBeTruthy();

    fireEvent.click(screen.getByText("Metro Gıda Toptan"));
    expect(screen.getByText(/1\.195\.278,24/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    fireEvent.click(screen.getByText("Acme Agency"));
    expect(screen.getByText("Customer owes you")).toBeTruthy();
    expect(screen.getByText(/3\.200,00/)).toBeTruthy();

    const theyOweStickers = container.querySelectorAll('[data-direction="they_owe"]');
    expect(theyOweStickers.length).toBeGreaterThanOrEqual(1);
    for (const sticker of theyOweStickers) {
      const amount = sticker.querySelector(".tabular-nums");
      expect(amount?.textContent ?? "").not.toMatch(/^\s*-/);
      expect(amount?.textContent ?? "").not.toContain("-");
    }
  });
});

describe("canAccessThemePreview", () => {
  it("allows owner and blocks cashier", () => {
    expect(canAccessThemePreview("owner")).toBe(true);
    expect(canAccessThemePreview("cashier")).toBe(false);
    expect(canAccessThemePreview("partner")).toBe(false);
  });
});

describe("preview page access", () => {
  it("renders gallery for owner", () => {
    render(<ThemePreviewPage />);
    expect(screen.getByText(/Mobile visual refresh v2/)).toBeTruthy();
    expect(screen.queryByText(/403/)).toBeNull();
  });

  it("shows 403 for cashier", () => {
    accessState.role = "cashier";
    render(<ThemePreviewPage />);
    expect(screen.getByText(/403/)).toBeTruthy();
    expect(screen.queryByText(/Mobile visual refresh v2/)).toBeNull();
  });
});
