// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
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

afterEach(cleanup);

function expectSharedChrome() {
  const total = screen.getByTestId("cash-bank-total");
  expect(total.className).toContain("w-full");
  expect(screen.getByTestId("cash-bank-total-label").textContent).toBe(
    "Total balance",
  );
  expect(screen.getByTestId("cash-bank-as-of-hint").textContent).toBe(
    "as of today",
  );
  const figure = screen.getByTestId("cash-bank-total-figure");
  expect(figure.className).toContain("w-full");
  expect(figure.className).toContain("text-[20px]");
  expect(figure.className).toContain("font-extrabold");
  expect(figure.className).not.toContain("truncate");

  const heading = screen.getByTestId("cash-bank-heading");
  expect(heading.contains(figure)).toBe(false);
  expect(heading.textContent).not.toMatch(/₺/);
}

describe("CashBankSnapshotCard", () => {
  it("two-row total + as of today; columns grid with vertical + stack dividers", async () => {
    render(
      <CashBankSnapshotCard
        cashKurus={140_000}
        bankKurus={25_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
          { id: "c2", name: "Bar Drawer", balance_kurus: 40_000 },
        ]}
      />,
    );

    expectSharedChrome();
    expect(screen.getByTestId("cash-bank-total-figure").textContent).toContain(
      "1.650,00 ₺",
    );
    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(2);

    for (const label of screen.getAllByTestId("cash-bank-subtotal-label")) {
      expect(label.className).toContain("text-[13px]");
      expect(label.className).toContain("font-bold");
      expect(label.className).toContain("text-ink-soft");
      expect(label.className).not.toContain("text-muted-foreground");
    }

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toContain(
      "sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]",
    );
    expect(columns.className).toContain("sm:gap-x-6");
    expect(columns.className).toContain("grid-cols-1");

    const vertical = screen.getByTestId("cash-bank-column-divider");
    expect(vertical.className).toContain("bg-rule-soft");
    expect(vertical.className).toContain("sm:block");
    expect(vertical.className).toContain("hidden");
    expect(vertical.className).toContain("w-px");

    const stack = screen.getByTestId("cash-bank-stack-divider");
    expect(stack.className).toContain("bg-rule-soft");
    expect(stack.className).toContain("sm:hidden");
    expect(stack.className).toContain("h-px");

    const headers = screen.getAllByTestId("cash-bank-col-header");
    expect(headers).toHaveLength(2);
    expect(headers[0].className).toBe(headers[1].className);
    expect(headers[0].textContent).toBe("Cash drawers");
    expect(headers[1].textContent).toBe("Bank accounts");

    expect(screen.getByTestId("cash-group").className).toContain("flex-col");
    expect(screen.getByTestId("bank-group").className).toContain("flex-col");
    const cashHtml = screen.getByTestId("cash-group").innerHTML;
    const bankHtml = screen.getByTestId("bank-group").innerHTML;
    expect(cashHtml).toContain("mt-auto");
    expect(bankHtml).toContain("mt-auto");

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("cash drawer rows share compact bank row rhythm (py-1.5 gap-3)", () => {
    render(
      <CashBankSnapshotCard
        cashKurus={50_000}
        bankKurus={0}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 50_000 },
        ]}
      />,
    );
    const row = screen.getByTestId("cash-drawer-row");
    expect(row.className).toContain("py-1.5");
    expect(row.className).toContain("gap-3");
  });

  it("mutation: subtotal label renders muted → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("SUBTOTAL_LABEL");
    expect(src).toContain("text-[13px]");
    expect(src).toContain("font-bold");
    expect(src).toContain("text-ink-soft");
    expect(src).toMatch(
      /cash-bank-subtotal-label[\s\S]{0,120}className=\{SUBTOTAL_LABEL\}/,
    );
    expect(src).not.toMatch(
      /cash-bank-subtotal-label[\s\S]{0,160}text-muted-foreground/,
    );
  });

  it("mutation: divider removed → red; restore → green", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-bank-column-divider");
    expect(src).toContain("cash-bank-stack-divider");
    expect(src).toContain("bg-rule-soft");
    expect(src).toContain("sm:gap-x-6");
    expect(src).toContain(
      "sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]",
    );

    const withoutDivider = src.replace(
      /data-testid="cash-bank-column-divider"[\s\S]*?\/>/,
      "",
    );
    expect(withoutDivider).not.toContain('data-testid="cash-bank-column-divider"');
    expect(src).toContain('data-testid="cash-bank-column-divider"');
  });

  it("mutation: independent misaligned column paddings return → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    // Shared rhythm constants — cash rows must not drift to py-1 / gap-2 alone.
    expect(src).toContain("ACCOUNT_ROW");
    expect(src).toContain("COL_HEADER");
    expect(src).toContain("py-1.5");
    expect(src).toContain("gap-3");
    expect(src).toContain("mt-auto");
    expect(src).toContain("flex-col");
    expect(src).toContain("cash-bank-col-header");
    // Independent padding fork (pre-align): cash py-1 without shared constant.
    expect(src).not.toMatch(
      /cash-drawer-row[\s\S]{0,80}gap-2 py-1(?!\.5)/,
    );
    expect(src).not.toMatch(/className="[^"]*gap-2 py-1"/);
  });

  it("mutation: inline truncated total returns → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-bank-total-label");
    expect(src).toContain("Total balance");
    expect(src).toContain("cash-bank-total-figure");
    expect(src).toContain("as of today");
    expect(src).toContain("text-[20px]");
    expect(src).toContain("font-extrabold");
    expect(src).not.toContain("Total cash & bank");
    expect(src).not.toMatch(
      /cash-bank-total-figure[\s\S]{0,120}truncate/,
    );
  });

  it("HomePage mounts CashBankSnapshotCard", () => {
    const page = sourceDeclaring("HomePage");
    expect(page).toContain("CashBankSnapshotCard");
    expect(page).toContain('data-layout="as-of-cash"');
  });
});
