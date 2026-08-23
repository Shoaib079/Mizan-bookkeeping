// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { applyVisualTheme, THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({
    banks: {
      accounts: [
        {
          id: "bank-1",
          name: "Garanti",
          account_kind: "bank",
          balance_kurus: 25_000,
          is_active: true,
          bank_name: "Garanti",
          last_four: null,
        },
      ],
      balance_kurus: 25_000,
    },
    cash: { accounts: [], balance_kurus: 0 },
    credit_cards: { accounts: [], balance_kurus: 0 },
    fx: { accounts: [], balance_kurus: 0 },
  })),
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

function renderCard(
  ui: React.ReactElement,
  { themeV2 = false }: { themeV2?: boolean } = {},
) {
  if (!themeV2) return render(ui);
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}

describe("CashBankSnapshotCard", () => {
  it("desktop: cash + banks side-by-side with two-row total and both subtotals", async () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={140_000}
        bankKurus={25_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
          { id: "c2", name: "Bar Drawer", balance_kurus: 40_000 },
        ]}
      />,
    );

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toContain("sm:grid-cols-2");
    expect(columns.className).toContain("grid-cols-1");

    const total = screen.getByTestId("cash-bank-total");
    expect(total.className).toContain("w-full");
    expect(screen.getByTestId("cash-bank-total-label").textContent).toBe(
      "Total balance",
    );
    expect(screen.getByTestId("cash-bank-as-of-hint").textContent).toBe(
      "as of today",
    );
    const figure = screen.getByTestId("cash-bank-total-figure");
    expect(figure.textContent).toContain("1.650,00 ₺");
    expect(figure.className).toContain("w-full");
    expect(figure.className).toContain("text-[20px]");
    expect(figure.className).toContain("font-extrabold");
    expect(figure.className).not.toContain("truncate");
    expect(figure.className).not.toMatch(/\bellipsis\b/);

    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(2);
    expect(screen.getByText("Cash drawers")).toBeTruthy();
    expect(screen.getByText("Bank accounts")).toBeTruthy();
    expect(screen.getByTestId("cash-group").textContent).toMatch(/Cash/);
    expect(screen.getByTestId("bank-group").textContent).toMatch(/Banks/);

    // v1 live: no column/stack dividers; muted subtotal labels
    expect(screen.queryByTestId("cash-bank-column-divider")).toBeNull();
    expect(screen.queryByTestId("cash-bank-stack-divider")).toBeNull();
    // Heading matches BalanceCard / sticker titles (ink + medium), both themes
    expect(screen.getByTestId("cash-bank-heading").className).toContain(
      "font-medium",
    );
    expect(screen.getByTestId("cash-bank-heading").className).toContain(
      "text-foreground",
    );
    expect(screen.getByTestId("cash-bank-heading").className).not.toContain(
      "text-muted-foreground",
    );
    for (const label of screen.getAllByTestId("cash-bank-subtotal-label")) {
      expect(label.className).toContain("text-muted-foreground");
      expect(label.className).not.toContain("font-bold");
      expect(label.className).not.toContain("text-[#3D4A63]");
    }

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("mobile card: stacks on narrow (grid-cols-1) and two columns from sm", () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={50_000}
        bankKurus={0}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 50_000 },
        ]}
      />,
    );

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toMatch(/grid-cols-1/);
    expect(columns.className).toMatch(/sm:grid-cols-2/);
    expect(screen.getByTestId("cash-bank-total")).toBeTruthy();
    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(1);
  });

  it("v2 >=sm: vertical hairline between columns; stack divider for <sm", async () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={100_000}
        bankKurus={50_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
        ]}
      />,
      { themeV2: true },
    );

    await waitFor(() => {
      expect(screen.getByTestId("cash-bank-column-divider")).toBeTruthy();
    });

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toContain("sm:gap-x-6");
    expect(columns.className).toContain(
      "sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]",
    );

    const colDivider = screen.getByTestId("cash-bank-column-divider");
    expect(colDivider.className).toContain("bg-[#E6EAF2]");
    expect(colDivider.className).toContain("hidden");
    expect(colDivider.className).toContain("sm:block");
    expect(colDivider.className).toContain("self-stretch");

    const stackDivider = screen.getByTestId("cash-bank-stack-divider");
    expect(stackDivider.className).toContain("bg-[#E6EAF2]");
    expect(stackDivider.className).toContain("sm:hidden");

    // Order: cash group → column divider → stack divider → bank group
    const kids = Array.from(columns.children).map(
      (el) => (el as HTMLElement).dataset.testid,
    );
    expect(kids.indexOf("cash-group")).toBeLessThan(
      kids.indexOf("cash-bank-column-divider"),
    );
    expect(kids.indexOf("cash-bank-column-divider")).toBeLessThan(
      kids.indexOf("bank-group"),
    );
    expect(kids.indexOf("cash-bank-stack-divider")).toBeLessThan(
      kids.indexOf("bank-group"),
    );
  });

  it("v2: Cash and Banks subtotal labels are bold dark slate, not muted", async () => {
    renderCard(
      <CashBankSnapshotCard cashKurus={10_000} bankKurus={20_000} />,
      { themeV2: true },
    );

    await waitFor(() => {
      const labels = screen.getAllByTestId("cash-bank-subtotal-label");
      expect(labels).toHaveLength(2);
      expect(labels.map((el) => el.getAttribute("data-label")).sort()).toEqual([
        "Banks",
        "Cash",
      ]);
      for (const label of labels) {
        expect(label.className).toContain("font-bold");
        expect(label.className).toContain("text-[13px]");
        expect(label.className).toContain("text-[#3D4A63]");
        expect(label.className).not.toContain("text-muted-foreground");
      }
    });
  });

  it("live New look: applyVisualTheme updates dividers/labels without remount", async () => {
    // Regression: useNewLookTheme was local state; toggle updated html but not this card.
    renderCard(
      <CashBankSnapshotCard cashKurus={10_000} bankKurus={20_000} />,
    );

    expect(screen.queryByTestId("cash-bank-column-divider")).toBeNull();
    expect(
      screen.getAllByTestId("cash-bank-subtotal-label")[0]?.className,
    ).toContain("text-muted-foreground");

    applyVisualTheme("v2");

    await waitFor(() => {
      expect(screen.getByTestId("cash-bank-column-divider")).toBeTruthy();
      for (const label of screen.getAllByTestId("cash-bank-subtotal-label")) {
        expect(label.className).toContain("font-bold");
        expect(label.className).toContain("text-[#3D4A63]");
        expect(label.className).not.toContain("text-muted-foreground");
      }
    });

    applyVisualTheme("v1");

    await waitFor(() => {
      expect(screen.queryByTestId("cash-bank-column-divider")).toBeNull();
      for (const label of screen.getAllByTestId("cash-bank-subtotal-label")) {
        expect(label.className).toContain("text-muted-foreground");
        expect(label.className).not.toContain("font-bold");
      }
    });
  });

  it("Cash & bank heading matches BalanceCard ink + medium weight", async () => {
    renderCard(
      <CashBankSnapshotCard cashKurus={10_000} bankKurus={20_000} />,
      { themeV2: true },
    );

    await waitFor(() => {
      const heading = screen.getByTestId("cash-bank-heading");
      expect(heading.className).toContain("font-medium");
      expect(heading.className).toContain("text-foreground");
      expect(heading.className).not.toContain("text-muted-foreground");
      expect(heading.textContent).toContain("Cash & bank");
    });
  });

  it("mutation: total back to truncated inline title row → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-bank-total-label");
    expect(src).toContain("Total balance");
    expect(src).toContain("cash-bank-total-figure");
    expect(src).toContain("as of today");
    expect(src).toContain("text-[20px]");
    expect(src).toContain("font-extrabold");
    // Must not put the figure on the heading row with truncate.
    expect(src).not.toMatch(
      /cash-bank-heading[\s\S]{0,400}cash-bank-total[\s\S]{0,200}truncate/,
    );
    expect(src).not.toMatch(
      /cash-bank-total-figure[\s\S]{0,120}truncate/,
    );
    expect(src).not.toContain("Total cash & bank");
  });

  it("mutation: collapse to single column always → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("sm:grid-cols-2");
    expect(src).toContain("cash-bank-columns");
    // Must keep a two-column breakpoint — always one column fails.
    expect(src).not.toMatch(
      /cash-bank-columns[\s\S]{0,120}className="[^"]*grid-cols-1(?![^"]*sm:grid-cols-2)/,
    );
  });

  it("mutation: remove divider or muted Cash/Banks on v2 → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-bank-column-divider");
    expect(src).toContain("cash-bank-stack-divider");
    expect(src).toContain("bg-[#E6EAF2]");
    expect(src).toContain("sm:gap-x-6");
    expect(src).toContain("text-[#3D4A63]");
    expect(src).toContain("font-bold");
    expect(src).toContain("text-[13px]");
    expect(src).toContain("SUBTOTAL_LABEL_V2");
    expect(src).toContain("SUBTOTAL_LABEL_V1");
    expect(src).toContain("cash-bank-heading");
    expect(src).toContain("font-medium text-foreground");
    expect(src).not.toMatch(
      /cash-bank-heading[\s\S]{0,200}text-muted-foreground/,
    );
    // v2 path must not force muted on the emphasis label constant
    expect(src).toMatch(
      /SUBTOTAL_LABEL_V2\s*=\s*"[^"]*font-bold[^"]*text-\[#3D4A63\]/,
    );
    expect(src).not.toMatch(
      /SUBTOTAL_LABEL_V2\s*=\s*"[^"]*text-muted-foreground/,
    );
  });
});
