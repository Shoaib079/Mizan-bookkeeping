// @vitest-environment jsdom

/** Mobile visual refresh v2 — token scope + owner-only preview gate. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ThemePreviewPage from "@/app/preview/page";
import { StatCard } from "@/components/page/stat-card";
import { MeaningChip } from "@/components/ui/meaning-chip";
import { ThemePreviewGallery } from "@/components/preview/theme-preview-gallery";
import { canAccessThemePreview } from "@/lib/entity-access";
import type { EntityRole } from "@/lib/settings-types";
import { THEME_V2_ATTR } from "@/lib/theme-v2";
import { ShoppingBag } from "lucide-react";

const accessState: { role: EntityRole; membershipSettled: boolean } = {
  role: "owner",
  membershipSettled: true,
};

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
vi.mock("@/components/layout/mobile-settings-modules", () => ({
  MobileSettingsModules: () => <div data-testid="settings-modules-stub" />,
}));

beforeEach(() => {
  accessState.role = "owner";
  accessState.membershipSettled = true;
});

afterEach(cleanup);

describe("theme v2 token scope", () => {
  it("StatCard icon chip uses v2 gradient when wrapped in data-theme=v2", () => {
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
    const iconShell = container.querySelector("[style*='kpi-icon-gradient']");
    expect(iconShell).toBeTruthy();
    expect(container.querySelector(`[data-theme="${THEME_V2_ATTR}"]`)).toBeTruthy();
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
    expect(screen.getByText("Mobile visual refresh v2")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("You owe supplier")).toBeTruthy();
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
    expect(screen.getByText("Mobile visual refresh v2")).toBeTruthy();
    expect(screen.queryByText(/403/)).toBeNull();
  });

  it("shows 403 for cashier", () => {
    accessState.role = "cashier";
    render(<ThemePreviewPage />);
    expect(screen.getByText(/403/)).toBeTruthy();
    expect(screen.queryByText("Mobile visual refresh v2")).toBeNull();
  });
});
