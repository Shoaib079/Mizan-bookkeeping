import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  dailyVisibleSections,
  occasionalRecordActions,
  PRIMARY_RECORD_ACTION_IDS,
  primaryRecordActions,
  RECORD_ACTIONS,
  recordActionsBySection,
} from "@/lib/record-actions";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** The Record desk, which is two files.
 *
 * The four button components moved to `record-desk-buttons.tsx` when the desk
 * was split; `role="tab"` went with them and this guard failed for a reason
 * that had nothing to do with what it guards. That is the ninth time in this
 * project a check pinned to a filename has broken on a move.
 *
 * Reading both is the honest fix — the assertions below are about the desk as
 * a feature, not about which file a line happens to live in. `readFileSync`
 * throws on a missing path, so a further move fails here by name rather than
 * by quietly finding nothing.
 */
function readDesk(): string {
  return [
    read("components/record/record-desk.tsx"),
    read("components/record/record-desk-buttons.tsx"),
  ].join("\n");
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
    const page = read("app/record/page.tsx");
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
    const modals = read("components/record-action-modals.tsx");
    expect(modals).toContain("FxUnifiedDialog");
    expect(modals).not.toContain("FxPurchaseQuickAction");
    expect(modals).not.toContain("FxWalletActionDialog");
  });

  it("routes staff salary through a dedicated salary-only expense dialog", () => {
    const modals = read("components/record-action-modals.tsx");
    expect(modals).toContain('effectiveModal === "staffSalary"');
    expect(modals).toContain('defaultRecordKind="salary"');
    expect(modals).toContain('defaultRecordKind="expense"');
  });
});
