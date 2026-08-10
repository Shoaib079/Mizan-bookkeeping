import { describe, expect, it } from "vitest";

import {
  sourceAt,
  sourceDeclaring,
  sourceDeclaringAll,
} from "@/test-support/source";

import {
  dailyVisibleSections,
  occasionalRecordActions,
  PRIMARY_RECORD_ACTION_IDS,
  primaryRecordActions,
  RECORD_ACTIONS,
  recordActionsBySection,
} from "@/lib/record-actions";

/** The Record desk, found by what it is rather than where it sits.
 *
 * `role="tab"` moved to `record-desk-buttons.tsx` when the desk was split,
 * and this guard failed for a reason unrelated to what it guards — the ninth
 * such failure in this project, and the reason D9 exists. Naming the two
 * components means the next split is invisible here.
 */
function readDesk(): string {
  return sourceDeclaringAll("RecordDesk", "DeskModeButton");
}

describe("Add page amount-first desk", () => {
  it("surfaces expenses, salary, sales, forex, upload, count cash, and close day as mode pills", () => {
    const primary = primaryRecordActions({ deliveryEnabled: true }).map(
      (action) => action.id,
    );
    expect(primary).toEqual([
      "sales",
      "expense",
      "staffSalary",
      "fx",
      "addDocument",
      "countCash",
      "closeDay",
    ]);
    expect(PRIMARY_RECORD_ACTION_IDS).toEqual(primary);
  });

  it("uses a left mode rail with icons beside the embedded form panel", () => {
    const desk = readDesk();
    const page = sourceAt("app/record/page.tsx");
    expect(page).toContain("<RecordDesk");
    expect(desk).toContain("primaryRecordActions");
    expect(desk).toContain("DeskModeButton");
    expect(desk).toContain('role="tab"');
    expect(desk).toContain("embedded");
    expect(desk).toContain("<RecordedTodayCard");
    expect(desk).not.toContain("RecordCard");
  });

  it("surfaces Split in Add cash actions (partner Record is on Partners)", () => {
    const desk = readDesk();
    expect(desk).toContain("DeskExtraButton");
    expect(desk).toContain("moreActions.length === 1");
    const payments = recordActionsBySection("payments", { deliveryEnabled: true });
    expect(payments.map((action) => action.id)).toEqual(["splitExpense"]);
    expect(occasionalRecordActions({ deliveryEnabled: true })).toHaveLength(0);
    expect(dailyVisibleSections({ deliveryEnabled: true })).toHaveLength(1);
  });

  it("hides bank transfer and card batch actions from the Add hub grid", () => {
    const visible = RECORD_ACTIONS.filter((action) => !action.hidden).map(
      (action) => action.id,
    );
    expect(visible).not.toContain("transfer");
    expect(visible).not.toContain("cardSalesBatch");
    expect(visible).not.toContain("posSettlement");
    expect(visible).not.toContain("clearCommission");
  });

  it("opens unified FX dialog for fx and legacy buy/convert/spend keys", () => {
    const modals = sourceDeclaring("RecordActionModals");
    expect(modals).toContain("FxUnifiedDialog");
    expect(modals).not.toContain("FxPurchaseQuickAction");
    expect(modals).not.toContain("FxWalletActionDialog");
  });

  it("routes staff salary through a dedicated salary-only expense dialog", () => {
    const modals = sourceDeclaring("RecordActionModals");
    expect(modals).toContain('effectiveModal === "staffSalary"');
    expect(modals).toContain('defaultRecordKind="salary"');
    expect(modals).toContain('defaultRecordKind="expense"');
  });
});
