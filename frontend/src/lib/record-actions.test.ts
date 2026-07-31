import { describe, expect, it } from "vitest";

import {
  filterRecordActions,
  isQuickActionKey,
  PERSON_PICKER_ACTIONS,
  PRIMARY_RECORD_ACTION_IDS,
  RECORD_ACTIONS,
  recordActionById,
  recordActionsBySection,
  primaryRecordActions,
  dailyVisibleSections,
  occasionalRecordActions,
} from "@/lib/record-actions";

describe("record-actions", () => {
  it("defines daily-visible sections for Add More menu", () => {
    const opts = { deliveryEnabled: true };
    const visible = dailyVisibleSections(opts);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.section).toBe("payments");
    expect(visible[0]?.actions.map((a) => a.id)).toEqual([
      "partnerReimbursement",
    ]);
    expect(recordActionsBySection("upload", opts).length).toBe(0);
    expect(recordActionsBySection("today", opts).length).toBe(0);
    expect(recordActionsBySection("salesCards", opts).length).toBe(0);
    expect(occasionalRecordActions(opts)).toHaveLength(0);
  });

  it("routes all uploads through the primary Upload card", () => {
    const upload = RECORD_ACTIONS.find((action) => action.id === "addDocument");
    expect(upload?.label).toBe("Upload");
    expect(upload?.description).toMatch(/bank/i);
    expect(RECORD_ACTIONS.find((a) => a.id === "deliveryReport")?.hidden).toBe(true);
  });

  it("surfaces six primary daily cards including upload", () => {
    const primary = primaryRecordActions({ deliveryEnabled: true }).map(
      (action) => action.id,
    );
    expect(primary).toEqual([
      "sales",
      "expense",
      "staffSalary",
      "fx",
      "addDocument",
      "closeDay",
    ]);
    expect(PRIMARY_RECORD_ACTION_IDS).toEqual(primary);
  });

  it("hides delivery report from the hub grid (opens from Upload dialog)", () => {
    const upload = recordActionsBySection("upload", { deliveryEnabled: true });
    expect(upload.some((action) => action.id === "deliveryReport")).toBe(false);
    const withDelivery = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled: true });
    expect(withDelivery.some((action) => action.id === "deliveryReport")).toBe(true);
  });

  it("hides sales & cards and bank-only actions from the Add hub", () => {
    const hidden = RECORD_ACTIONS.filter(
      (action) => action.section === "salesCards" && action.hidden,
    );
    expect(hidden.map((action) => action.id)).toEqual([
      "cardSalesBatch",
      "posSettlement",
      "clearCommission",
    ]);
    const visible = RECORD_ACTIONS.filter((action) => !action.hidden).map(
      (action) => action.id,
    );
    expect(visible).not.toContain("transfer");
    expect(visible).not.toContain("buyFx");
  });

  it("keeps only partner reimbursement in Add More cash actions", () => {
    const payments = recordActionsBySection("payments", { deliveryEnabled: true });
    expect(payments.map((action) => action.id)).toEqual(["partnerReimbursement"]);
  });

  it("hides staff, supplier, and page-owned actions from Add hub", () => {
    const hiddenIds = RECORD_ACTIONS.filter((a) => a.hidden).map((a) => a.id);
    expect(hiddenIds).toContain("supplierPayment");
    expect(hiddenIds).toContain("staffAdvance");
    expect(hiddenIds).toContain("staffAccrual");
    expect(hiddenIds).toContain("cashMovement");
    expect(hiddenIds).toContain("customerPayment");
    expect(hiddenIds).toContain("partnerDrawing");
    expect(hiddenIds).toContain("customerCreditSale");
    expect(hiddenIds).toContain("supplier");
  });

  it("uses person pickers for routable people actions", () => {
    expect(PERSON_PICKER_ACTIONS.has("staffAccrual")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("partnerReimbursement")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("customerPayment")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("supplierPayment")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("expense")).toBe(false);
  });

  it("identifies quick action keys correctly", () => {
    expect(isQuickActionKey("expense")).toBe(true);
    expect(isQuickActionKey("sales")).toBe(true);
    expect(isQuickActionKey("fx")).toBe(true);
    expect(isQuickActionKey("efatura")).toBe(true);
    expect(isQuickActionKey("closeDay")).toBe(false);
    expect(isQuickActionKey("transfer")).toBe(false);
  });

  it("filters delivery-gated actions from the full list", () => {
    const off = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled: false });
    expect(off.some((action) => action.id === "deliveryReport")).toBe(false);
    const on = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled: true });
    expect(on.some((action) => action.id === "deliveryReport")).toBe(true);
  });

  it("marks routed upload types as hidden from the hub grid", () => {
    const hiddenIds = RECORD_ACTIONS.filter((a) => a.hidden).map((a) => a.id);
    expect(hiddenIds).toContain("posPhoto");
    expect(hiddenIds).toContain("receipt");
    expect(hiddenIds).toContain("efatura");
    expect(hiddenIds).toContain("bankStatement");
    expect(hiddenIds).not.toContain("addDocument");
  });

  it("hides duplicate salary and partner-fronted cards", () => {
    expect(occasionalRecordActions({ deliveryEnabled: true })).toHaveLength(0);
    expect(
      recordActionsBySection("payments", { deliveryEnabled: true }).map((a) => a.id),
    ).toEqual(["partnerReimbursement"]);
  });

  it("still resolves hidden actions by key via recordActionById", () => {
    expect(recordActionById("posPhoto").id).toBe("posPhoto");
    expect(recordActionById("receipt").id).toBe("receipt");
    expect(recordActionById("efatura").id).toBe("efatura");
    expect(recordActionById("bankStatement").id).toBe("bankStatement");
  });
});
