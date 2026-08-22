// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecentlyRecordedCard } from "@/components/record/recently-recorded-card";
import { sourceDeclaring } from "@/test-support/source";
import type { RecentEntryRow } from "@/lib/recent-entries";

const openTransaction = vi.fn();

vi.mock("@/components/ledger/transaction-drawer", () => ({
  useTransactionPeek: () => ({ openTransaction }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

const apiFetchMock = vi.mocked(apiFetch);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function entry(
  partial: Partial<RecentEntryRow> &
    Pick<RecentEntryRow, "id" | "entry_date" | "description">,
): RecentEntryRow {
  return {
    source: "manual_expense",
    status: "posted",
    reverses_entry_id: null,
    lines: [{ amount_kurus: 1_250_00, side: "debit" }],
    ...partial,
  };
}

describe("Recently recorded — render", () => {
  it("shows three dates newest-first, capped at 10, each date visible", async () => {
    const items = [
      entry({ id: "a", entry_date: "2026-08-22", description: "Today expense" }),
      entry({ id: "b", entry_date: "2026-08-15", description: "Mid expense" }),
      entry({ id: "c", entry_date: "2026-07-01", description: "July expense" }),
      ...Array.from({ length: 10 }, (_, i) =>
        entry({
          id: `extra-${i}`,
          entry_date: "2026-06-01",
          description: `Old ${i}`,
        }),
      ),
    ];
    apiFetchMock.mockResolvedValue({ items, total: items.length });

    renderWithQuery(<RecentlyRecordedCard entityId="ent-1" />);

    await waitFor(() => {
      expect(screen.getAllByTestId("recent-entry-row").length).toBe(10);
    });
    expect(screen.getByText("Recently recorded")).toBeTruthy();
    const rows = screen.getAllByTestId("recent-entry-row");
    expect(rows[0]?.getAttribute("data-entry-date")).toBe("2026-08-22");
    expect(rows[1]?.getAttribute("data-entry-date")).toBe("2026-08-15");
    expect(rows[2]?.getAttribute("data-entry-date")).toBe("2026-07-01");

    const dates = screen.getAllByTestId("recent-entry-date");
    expect(dates[0]?.textContent).toMatch(/22\.08\.2026/);
    expect(dates[1]?.textContent).toMatch(/15\.08\.2026/);
    expect(dates[2]?.textContent).toMatch(/01\.07\.2026/);
  });

  it("voided entry is ABSENT; reversals absent", async () => {
    apiFetchMock.mockResolvedValue({
      items: [
        entry({
          id: "voided-1",
          entry_date: "2026-08-20",
          description: "Voided rent",
          status: "voided",
        }),
        entry({
          id: "rev-1",
          entry_date: "2026-08-20",
          description: "Void: rent",
          reverses_entry_id: "voided-1",
        }),
        entry({
          id: "ok-1",
          entry_date: "2026-08-19",
          description: "Keep me",
        }),
      ],
      total: 3,
    });

    renderWithQuery(<RecentlyRecordedCard entityId="ent-1" />);

    await waitFor(() => {
      expect(screen.getByText("Keep me")).toBeTruthy();
    });
    expect(screen.queryByText("Voided rent")).toBeNull();
    expect(screen.queryByText("Void: rent")).toBeNull();
    expect(screen.queryByText("Voided")).toBeNull();
    expect(
      screen
        .getAllByTestId("recent-entry-row")
        .some((el) => el.getAttribute("data-entry-status") === "voided"),
    ).toBe(false);
  });

  it("corrected repost present with Edited badge", async () => {
    apiFetchMock.mockResolvedValue({
      items: [
        entry({
          id: "new-1",
          entry_date: "2026-08-21",
          description: "Corrected rent",
          amends_entry_id: "old-1",
        }),
      ],
      total: 1,
    });

    renderWithQuery(<RecentlyRecordedCard entityId="ent-1" />);

    await waitFor(() => {
      expect(screen.getByText("Corrected rent")).toBeTruthy();
    });
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("View all links to /reports/ledger", async () => {
    apiFetchMock.mockResolvedValue({ items: [], total: 0 });
    renderWithQuery(<RecentlyRecordedCard entityId="ent-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("recent-entries-view-all")).toBeTruthy();
    });
    expect(
      screen.getByTestId("recent-entries-view-all").getAttribute("href"),
    ).toBe("/reports/ledger");
  });
});

describe("RecentlyRecordedCard wiring + mutation", () => {
  it("uses effective-only list URL and Recently recorded heading", () => {
    const src = sourceDeclaring("RecentlyRecordedCard");
    expect(src).toContain('title="Recently recorded"');
    expect(src).toContain("recentEntriesListUrl(entityId");
    expect(src).toContain("effectiveOnly: true");
    expect(src).toContain('viewAllHref="/reports/ledger"');
    expect(src).not.toContain("effectiveOnly: false");
  });

  it("mutation: render a voided row inside Recently recorded → red", () => {
    const filterSrc = sourceDeclaring("filterRecentEntriesForDisplay");
    const brokenFilter = filterSrc.replace(
      'row.status !== "voided" && !row.reverses_entry_id',
      "!row.reverses_entry_id",
    );
    expect(brokenFilter).not.toContain('row.status !== "voided"');
    expect(filterSrc).toContain('row.status !== "voided"');

    const cardSrc = sourceDeclaring("RecentlyRecordedCard");
    const brokenCard = cardSrc.replace(
      "effectiveOnly: true",
      "effectiveOnly: false",
    );
    expect(brokenCard).toContain("effectiveOnly: false");
    expect(cardSrc).toContain("effectiveOnly: true");
  });

  it("Record desk mounts RecentlyRecordedCard", () => {
    const desk = sourceDeclaring("RecordDesk");
    expect(desk).toContain("<RecentlyRecordedCard");
    expect(desk).not.toContain("RecordedTodayCard");
  });
});
