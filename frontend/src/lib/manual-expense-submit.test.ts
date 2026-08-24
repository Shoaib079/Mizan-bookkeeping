import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  manualExpenseSuccessToast,
  submitManualExpense,
} from "@/lib/manual-expense-submit";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

const apiFetchMock = vi.mocked(apiFetch);

describe("manualExpenseSuccessToast", () => {
  it("distinguishes cash vs partner", () => {
    expect(manualExpenseSuccessToast("cash")).toBe("Expense recorded");
    expect(manualExpenseSuccessToast("partner")).toBe(
      "Partner expense recorded",
    );
  });
});

describe("submitManualExpense", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });

  it("posts partner-paid expenses to expenses-fronted", async () => {
    await submitManualExpense({
      entityId: "e1",
      actorId: "a1",
      paymentMode: "partner",
      partnerId: "p1",
      moneyAccountId: "m1",
      expenseAccountId: "x1",
      expenseDate: "2026-08-01",
      amountKurus: 1000,
      itemName: "Tea",
      notes: "",
      confirmExpenseItemId: null,
      idempotencyKey: "idem-1",
      acknowledgedDuplicate: false,
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path] = apiFetchMock.mock.calls[0]!;
    expect(path).toBe("/entities/e1/partners/p1/expenses-fronted");
  });

  it("posts cash expenses to /expenses", async () => {
    await submitManualExpense({
      entityId: "e1",
      actorId: "a1",
      paymentMode: "cash",
      partnerId: "",
      moneyAccountId: "m1",
      expenseAccountId: "x1",
      expenseDate: "2026-08-01",
      amountKurus: 1000,
      itemName: "Tea",
      notes: "note",
      confirmExpenseItemId: "item-1",
      idempotencyKey: "idem-2",
      acknowledgedDuplicate: false,
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0]!;
    expect(path).toBe("/entities/e1/expenses");
    expect(init?.idempotencyKey).toBe("idem-2");
  });
});
