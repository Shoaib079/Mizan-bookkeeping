import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("RecordDesk");

describe("RecordDesk", () => {
  it("renders v3 icon grid and embedded primary forms", () => {
    expect(source()).toContain("RecordDeskIconGrid");
    expect(source()).toContain("RECORD_DESK_TILES");
    expect(source()).toContain("RecordDeskFormPanel");
    expect(source()).toContain("RecentlyRecordedCard");
  });

  it("routes confirmed uploads through openRecordActionWithFile", () => {
    expect(source()).toContain("openRecordActionWithFile");
    expect(source()).toContain("handleDocumentConfirm");
  });

  it("keeps Upload / Count cash / Close day in More extras", () => {
    expect(source()).toContain("RECORD_DESK_EXTRA_ACTION_IDS");
    expect(source()).toContain("MoreActionButton");
    expect(source()).toContain("useDismissOnOutsideClick");
    expect(source()).toContain('role="menu"');
  });
});

describe("Record desk v3 tiles", () => {
  it("defines seven icon tiles with required tints", () => {
    const tiles = sourceDeclaring("RECORD_DESK_TILES");
    expect(tiles).toContain('"sales"');
    expect(tiles).toContain('"expense"');
    expect(tiles).toContain('"staffSalary"');
    expect(tiles).toContain('"payment"');
    expect(tiles).toContain('"transfer"');
    expect(tiles).toContain('"split"');
    expect(tiles).toContain('"fx"');
    expect(tiles).toContain('tint: "mint"');
    expect(tiles).toContain('tint: "blush"');
    expect(tiles).toContain('icon: Globe');
  });
});
