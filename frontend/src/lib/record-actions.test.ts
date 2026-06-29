import { describe, expect, it } from "vitest";

import {
  filterRecordActions,
  isQuickActionKey,
  NEW_COMMAND_QUICK_ACTIONS,
  PERSON_PICKER_ACTIONS,
  RECORD_ACTIONS,
  recordActionsBySection,
} from "@/lib/record-actions";

describe("record-actions", () => {
  it("defines every UX1 card group with at least one action", () => {
    const sections = [
      "today",
      "upload",
      "cashFx",
      "salesCards",
      "people",
      "suppliers",
    ] as const;
    for (const section of sections) {
      expect(recordActionsBySection(section, { deliveryEnabled: true }).length).toBeGreaterThan(0);
    }
  });

  it("hides delivery report when delivery is off", () => {
    const upload = recordActionsBySection("upload", { deliveryEnabled: false });
    expect(upload.some((action) => action.id === "deliveryReport")).toBe(false);
    const withDelivery = recordActionsBySection("upload", { deliveryEnabled: true });
    expect(withDelivery.some((action) => action.id === "deliveryReport")).toBe(true);
  });

  it("marks advanced sales & cards actions", () => {
    const advanced = RECORD_ACTIONS.filter(
      (action) => action.section === "salesCards" && action.advanced,
    );
    expect(advanced.map((action) => action.id)).toEqual([
      "cardSalesBatch",
      "posSettlement",
      "clearCommission",
    ]);
  });

  it("uses person pickers for people and supplier payment cards", () => {
    expect(PERSON_PICKER_ACTIONS.has("staffAccrual")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("partnerReimbursement")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("customerPayment")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("supplierPayment")).toBe(true);
    expect(PERSON_PICKER_ACTIONS.has("expense")).toBe(false);
  });

  it("keeps New menu palette keys as quick actions only", () => {
    for (const key of Object.values(NEW_COMMAND_QUICK_ACTIONS)) {
      expect(isQuickActionKey(key)).toBe(true);
    }
  });

  it("filters delivery-gated actions from the full list", () => {
    const off = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled: false });
    expect(off.some((action) => action.id === "deliveryReport")).toBe(false);
    const on = filterRecordActions(RECORD_ACTIONS, { deliveryEnabled: true });
    expect(on.some((action) => action.id === "deliveryReport")).toBe(true);
  });
});
