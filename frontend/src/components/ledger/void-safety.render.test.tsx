// @vitest-environment jsdom

/** Void safety — two-step confirm before any void API call. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  entityPath: (entityId: string, path: string) => `/entities/${entityId}/${path}`,
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => ({
    resetSubmit: vi.fn(),
    beginSubmit: () => "void-idem-key",
    completeSubmit: vi.fn(),
  }),
}));
vi.mock("@/lib/use-period-unlock-submit", () => ({
  usePeriodUnlockSubmit: () => ({
    submitWithPeriodUnlock: async (fn: (reason?: string) => Promise<unknown>) =>
      fn(undefined),
    PeriodUnlockDialog: () => null,
  }),
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => true,
}));

const { CustomerLedgerRowActions } = await import(
  "@/components/customers/customer-ledger-row-actions"
);
const { GlEntryActions } = await import("@/components/ledger/gl-entry-actions");

const LEDGER_ROW = {
  id: "cle-1",
  movement_date: "2026-08-01",
  movement_type: "payment_received",
  description: "Customer payment",
  amount_kurus: 120_000,
  forex_currency: null,
  payment_native_quantity: null,
  reference_type: null,
  reference_id: null,
  journal_entry_id: "je-pay-1",
  payment_account_id: "acct-1",
  display_kind: "effective" as const,
};

beforeEach(() => {
  apiFetch.mockReset();
});

afterEach(cleanup);

describe("mobile customer ledger void safety", () => {
  it("does not call the void API until confirm and void form submit", async () => {
    render(
      <CustomerLedgerRowActions
        row={LEDGER_ROW}
        onEdit={() => undefined}
        onVoid={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(apiFetch).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Are you sure?" })).toBeTruthy(),
    );
    expect(screen.getByText(/01\.08\.2026 · Payment received · 1\.200,00 ₺/)).toBeTruthy();

    const voidButtons = screen.getAllByRole("button", { name: "Void" });
    fireEvent.click(voidButtons[voidButtons.length - 1]!);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("desktop GL void safety", () => {
  it("opens confirm then void dialog without posting on first tap", async () => {
    apiFetch.mockResolvedValue({
      can_edit: false,
      can_void: true,
      void_path: "ledger/entries/je-1/void",
      edit: null,
    });

    render(
      <GlEntryActions
        row={{
          id: "je-1",
          entry_date: "2026-08-01",
          description: "Supplier invoice",
          source: "invoice",
          status: "posted",
        }}
        onGenericEdit={() => undefined}
        onSaved={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(apiFetch).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Are you sure?" })).toBeTruthy(),
    );

    const voidButtons = screen.getAllByRole("button", { name: "Void" });
    fireEvent.click(voidButtons[voidButtons.length - 1]!);

    await waitFor(() =>
      expect(screen.getByLabelText(/Void date/)).toBeTruthy(),
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(String(apiFetch.mock.calls[0]?.[0])).toContain("/actions");
  });
});

describe("void confirm cancel paths", () => {
  it("Escape closes the confirm sheet with no API call", async () => {
    render(
      <CustomerLedgerRowActions
        row={LEDGER_ROW}
        onEdit={() => undefined}
        onVoid={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("Cancel closes the confirm sheet with no API call", async () => {
    render(
      <CustomerLedgerRowActions
        row={LEDGER_ROW}
        onEdit={() => undefined}
        onVoid={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("void safety mutation guard", () => {
  it("mutation: one-tap void in SubledgerRowActions fails the guard", () => {
    const src = sourceDeclaring("SubledgerRowActions");
    expect(src).toContain("VoidTriggerButton");
    const broken = src.replace("<VoidTriggerButton", "<BrokenDirectVoid");
    expect(broken).not.toContain("<VoidTriggerButton");
  });

  it("confirm dialog defaults to Are you sure? and red Void label", () => {
    const src = sourceDeclaring("VoidConfirmDialog");
    expect(src).toContain('title = "Are you sure?"');
    expect(src).toContain('confirmLabel = "Void"');
    expect(src).toContain("autoFocus");
    expect(src).not.toMatch(/confirmRef|voidRef/);
  });
});
