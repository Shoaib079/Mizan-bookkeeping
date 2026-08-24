import { describe, expect, it } from "vitest";

import { canOneClickPostInvoiceDraft } from "@/lib/invoice-draft-capabilities";

describe("canOneClickPostInvoiceDraft", () => {
  const supplierBase = {
    one_click_post_eligible: true,
    status: "draft",
    invoice_kind: "supplier",
    supplier_id: "sup-1",
    delivery_platform_id: null as string | null,
  };

  const commissionBase = {
    one_click_post_eligible: true,
    status: "draft",
    invoice_kind: "delivery_commission",
    supplier_id: null as string | null,
    delivery_platform_id: "plat-1",
  };

  it("allows supplier one-click with supplier_id", () => {
    expect(canOneClickPostInvoiceDraft(supplierBase)).toBe(true);
  });

  it("rejects supplier one-click without supplier_id", () => {
    expect(
      canOneClickPostInvoiceDraft({ ...supplierBase, supplier_id: null }),
    ).toBe(false);
  });

  it("allows commission one-click with delivery_platform_id", () => {
    expect(canOneClickPostInvoiceDraft(commissionBase)).toBe(true);
  });

  it("rejects commission one-click without delivery_platform_id", () => {
    expect(
      canOneClickPostInvoiceDraft({
        ...commissionBase,
        delivery_platform_id: null,
      }),
    ).toBe(false);
  });

  it("rejects when one_click_post_eligible is false", () => {
    expect(
      canOneClickPostInvoiceDraft({
        ...supplierBase,
        one_click_post_eligible: false,
      }),
    ).toBe(false);
    expect(
      canOneClickPostInvoiceDraft({
        ...commissionBase,
        one_click_post_eligible: false,
      }),
    ).toBe(false);
  });

  it("rejects when status is confirmed (not linkable)", () => {
    expect(
      canOneClickPostInvoiceDraft({ ...supplierBase, status: "confirmed" }),
    ).toBe(false);
    expect(
      canOneClickPostInvoiceDraft({ ...commissionBase, status: "confirmed" }),
    ).toBe(false);
  });
});
