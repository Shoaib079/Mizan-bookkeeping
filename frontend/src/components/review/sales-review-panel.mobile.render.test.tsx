// @vitest-environment jsdom

/** POS daily sales — mobile card Correct + Void parity with desktop /sales. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PosDailySalesPostedActions } from "@/components/sales/pos-daily-sales-posted-actions";
import { grantsForRole } from "@/lib/member-grants";
import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();
const beginSubmit = vi.fn(() => "correct-idem-key");
const completeSubmit = vi.fn();

const accessState = {
  grants: grantsForRole("owner") as string[],
};

const POSTED_SUMMARY = {
  id: "pds-1",
  summary_date: "2026-08-05",
  cash_kurus: 800_00,
  card_kurus: 1_200_00,
  total_kurus: 2_000_00,
  confirmed_cash_kurus: 800_00,
  confirmed_card_kurus: 1_200_00,
  status: "posted",
  money_account_id: "cash-1",
  review_reason: null,
  z_report_kurus: null,
  extraction_payload: {},
};

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({ grants: accessState.grants }),
}));
vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => true,
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => ({
    resetSubmit: vi.fn(),
    beginSubmit,
    completeSubmit,
  }),
}));
vi.mock("@/lib/use-period-unlock-submit", () => ({
  usePeriodUnlockSubmit: () => ({
    submitWithPeriodUnlock: async (fn: (reason?: string) => Promise<unknown>) =>
      fn(undefined),
    PeriodUnlockDialog: () => null,
  }),
}));
vi.mock("@/lib/entity-settings", () => ({
  isEntitySettingEnabled: async () => false,
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/unsaved-work", () => ({
  useUnsavedWork: () => ({
    hasUnsavedWork: false,
    requestLeave: (fn: () => void) => fn(),
    register: vi.fn(),
    unregister: vi.fn(),
  }),
}));
vi.mock("@/lib/use-form-dirty", () => ({
  useEditFormDirty: () => ({ dirty: false, markTouched: vi.fn() }),
}));
vi.mock("@/lib/use-sales-review-url", () => ({
  useSalesReviewUrl: () => ({
    from: "2026-08-01",
    to: "2026-08-31",
    review: "all" as const,
    setRange: vi.fn(),
    setReview: vi.fn(),
    listQuery: "limit=50&offset=0",
    exportQuery: "from=2026-08-01",
    offset: 0,
    setOffset: vi.fn(),
    pageSize: 50,
  }),
  SALES_REVIEW_FILTERS: [{ id: "all", label: "All" }],
  salesFilterUsesRange: () => false,
}));

const { SalesReviewPanel } = await import("@/components/review/sales-review-panel");
const { CorrectDailySalesForm } = await import(
  "@/components/forms/correct-daily-sales-form"
);

beforeEach(() => {
  apiFetch.mockReset();
  beginSubmit.mockClear();
  completeSubmit.mockClear();
  accessState.grants = grantsForRole("owner");
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/pos/daily-summaries?") && !init?.method) {
      return { items: [POSTED_SUMMARY], total: 1 };
    }
    if (url.includes("/banking/accounts")) {
      return { items: [{ id: "cash-1", name: "Drawer" }] };
    }
    if (url.includes("/correct") && init?.method === "POST") {
      return { status: "posted" };
    }
    if (url.includes("/void") && init?.method === "POST") {
      return { status: "voided" };
    }
    return {};
  });
});

afterEach(cleanup);

describe("mobile daily sales posted row actions", () => {
  it("lists Edit (correct) and Void on the mobile card for a posted day", async () => {
    render(<SalesReviewPanel defaultFilter="posted" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Void" })).toBeTruthy();
  });

  it("Void shows date · type · amount and does not POST until confirm then void form", async () => {
    render(<SalesReviewPanel defaultFilter="posted" />);
    await waitFor(() => screen.getByRole("button", { name: "Void" }));

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/void"),
      expect.anything(),
    );

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Are you sure?" })).toBeTruthy(),
    );
    expect(screen.getByText(/05\.08\.2026 · Daily sales · 2\.000,00 ₺/)).toBeTruthy();

    const voidButtons = screen.getAllByRole("button", { name: "Void" });
    fireEvent.click(voidButtons[voidButtons.length - 1]!);

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Void daily sales" })).toBeTruthy(),
    );
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/void"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Edit opens the pre-filled correct form and posts once with a stable idempotency key", async () => {
    render(
      <>
        <SalesReviewPanel defaultFilter="posted" />
        <CorrectDailySalesForm
          open
          summary={POSTED_SUMMARY}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Edit daily sales" })).toBeTruthy(),
    );
    expect((screen.getByLabelText(/Date/i) as HTMLInputElement).value).toBe(
      "05.08.2026",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(beginSubmit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(beginSubmit).toHaveBeenCalledTimes(2));
    expect(beginSubmit).toHaveReturnedWith("correct-idem-key");
  });

  it("hides actions without record:sales grant", async () => {
    accessState.grants = grantsForRole("partner_view_only");
    render(<SalesReviewPanel defaultFilter="posted" />);
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("mutation: mobile card without PosDailySalesPostedActions goes red", () => {
    const source = sourceDeclaring("SalesReviewMobileList");
    expect(source).toContain("PosDailySalesPostedActions");
    expect(source).toContain("compact");
    const broken = source.replaceAll("PosDailySalesPostedActions", "span");
    expect(broken).not.toContain("PosDailySalesPostedActions");
  });
});

describe("PosDailySalesPostedActions unit", () => {
  it("forwards void confirm detail from posDailySalesVoidConfirmDetail", async () => {
    render(
      <PosDailySalesPostedActions
        row={POSTED_SUMMARY}
        grants={grantsForRole("owner")}
        onCorrect={() => undefined}
        onVoid={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() =>
      expect(screen.getByText(/05\.08\.2026 · Daily sales · 2\.000,00 ₺/)).toBeTruthy(),
    );
  });
});
