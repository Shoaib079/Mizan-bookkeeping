import { describe, expect, it } from "vitest";

type MinimalDraft = {
  one_click_post_eligible: boolean;
  status: string;
  invoice_kind: string;
  supplier_id: string | null;
  delivery_platform_id: string | null;
};

function canOneClickPost(draft: MinimalDraft): boolean {
  const canLink = draft.status === "draft" || draft.status === "needs_review";
  const isCommission = draft.invoice_kind === "delivery_commission";
  return (
    draft.one_click_post_eligible &&
    canLink &&
    (isCommission
      ? Boolean(draft.delivery_platform_id)
      : Boolean(draft.supplier_id))
  );
}

describe("canOneClickPost", () => {
  const supplierBase: MinimalDraft = {
    one_click_post_eligible: true,
    status: "draft",
    invoice_kind: "supplier",
    supplier_id: "sup-1",
    delivery_platform_id: null,
  };

  const commissionBase: MinimalDraft = {
    one_click_post_eligible: true,
    status: "draft",
    invoice_kind: "delivery_commission",
    supplier_id: null,
    delivery_platform_id: "plat-1",
  };

  it("allows supplier one-click with supplier_id", () => {
    expect(canOneClickPost(supplierBase)).toBe(true);
  });

  it("rejects supplier one-click without supplier_id", () => {
    expect(canOneClickPost({ ...supplierBase, supplier_id: null })).toBe(false);
  });

  it("allows commission one-click with delivery_platform_id", () => {
    expect(canOneClickPost(commissionBase)).toBe(true);
  });

  it("rejects commission one-click without delivery_platform_id", () => {
    expect(
      canOneClickPost({ ...commissionBase, delivery_platform_id: null }),
    ).toBe(false);
  });

  it("rejects when one_click_post_eligible is false", () => {
    expect(
      canOneClickPost({ ...supplierBase, one_click_post_eligible: false }),
    ).toBe(false);
    expect(
      canOneClickPost({ ...commissionBase, one_click_post_eligible: false }),
    ).toBe(false);
  });

  it("rejects when status is confirmed (not linkable)", () => {
    expect(
      canOneClickPost({ ...supplierBase, status: "confirmed" }),
    ).toBe(false);
    expect(
      canOneClickPost({ ...commissionBase, status: "confirmed" }),
    ).toBe(false);
  });
});
