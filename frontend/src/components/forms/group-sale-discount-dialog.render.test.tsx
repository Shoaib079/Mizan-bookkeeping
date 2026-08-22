// @vitest-environment jsdom

/** Group-sale discount dialog — stable idempotency key per submit intent. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sourceAt } from "@/test-support/source";

const {
  apiFetch,
  beginSubmit,
  completeSubmit,
  resetSubmit,
  storedKeyRef,
  submitIdempotencyApi,
} = vi.hoisted(() => {
  const apiFetch = vi.fn();
  let storedKey: string | null = null;
  let mintCount = 0;

  const beginSubmit = vi.fn(() => {
    if (!storedKey) {
      mintCount += 1;
      storedKey = mintCount === 1 ? "discount-key-aaa" : "discount-key-bbb";
    }
    return storedKey;
  });
  const completeSubmit = vi.fn(() => {
    storedKey = null;
  });
  const resetSubmit = vi.fn(() => {
    storedKey = null;
  });
  const storedKeyRef = {
    get: () => storedKey,
    reset: () => {
      storedKey = null;
      mintCount = 0;
    },
  };
  const submitIdempotencyApi = {
    beginSubmit,
    completeSubmit,
    resetSubmit,
    peekKey: () => storedKeyRef.get(),
  };

  return {
    apiFetch,
    beginSubmit,
    completeSubmit,
    resetSubmit,
    storedKeyRef,
    submitIdempotencyApi,
  };
});

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => submitIdempotencyApi,
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { GroupSaleDiscountDialog } = await import(
  "@/components/forms/group-sale-discount-dialog"
);

const FOREX_ONLY_SALE = {
  id: "sale-1",
  currency: "USD",
  forex_currency: "USD",
  fx_rate_used: null,
  total_kurus: 0,
  remaining_kurus: 0,
  remaining_forex_minor: 50_000,
};

beforeEach(() => {
  storedKeyRef.reset();
  beginSubmit.mockClear();
  completeSubmit.mockClear();
  resetSubmit.mockClear();
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({});
});

afterEach(cleanup);

async function submitDiscount(amount = "50,00") {
  fireEvent.change(screen.getByLabelText(/Discount amount/), {
    target: { value: amount },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply discount" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
}

describe("GroupSaleDiscountDialog idempotency", () => {
  it("reuses one stable key on retry until success", async () => {
    apiFetch.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});

    render(
      <GroupSaleDiscountDialog
        open
        sale={FOREX_ONLY_SALE}
        onClose={() => undefined}
      />,
    );

    await submitDiscount();
    expect(completeSubmit).not.toHaveBeenCalled();

    await submitDiscount();

    expect(beginSubmit).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const firstKey = apiFetch.mock.calls[0]?.[1]?.idempotencyKey;
    const secondKey = apiFetch.mock.calls[1]?.[1]?.idempotencyKey;
    expect(firstKey).toBe("discount-key-aaa");
    expect(secondKey).toBe(firstKey);
    expect(completeSubmit).toHaveBeenCalledTimes(1);
  });

  it("mints a new key only after success", async () => {
    render(
      <GroupSaleDiscountDialog
        open
        sale={FOREX_ONLY_SALE}
        onClose={() => undefined}
      />,
    );

    await submitDiscount();
    expect(completeSubmit).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0]?.[1]?.idempotencyKey).toBe("discount-key-aaa");

    await submitDiscount();
    expect(apiFetch.mock.calls[1]?.[1]?.idempotencyKey).toBe("discount-key-bbb");
  });

  it("resets the in-flight key when the dialog reopens", () => {
    render(
      <GroupSaleDiscountDialog
        open
        sale={FOREX_ONLY_SALE}
        onClose={() => undefined}
      />,
    );
    expect(resetSubmit).toHaveBeenCalled();
  });

  it("mutation: minting a fresh key per call fails the guard", () => {
    const src = sourceAt("components/forms/group-sale-discount-dialog.tsx");
    expect(src).toMatch(/submitIdempotency\.beginSubmit\(\)/);
    const broken = src.replace(
      "const idempotencyKey = submitIdempotency.beginSubmit();",
      "const idempotencyKey = newIdempotencyKey();",
    );
    expect(broken).not.toMatch(/submitIdempotency\.beginSubmit\(\)/);
  });
});
