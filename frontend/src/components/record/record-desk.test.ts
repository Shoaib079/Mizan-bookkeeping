import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("RecordDesk");

describe("RecordDesk", () => {
  it("renders v3 icon grid and embedded forms without a More menu", () => {
    expect(source()).toContain("RecordDeskIconGrid");
    expect(source()).toContain("RECORD_DESK_TILES");
    expect(source()).toContain("RecordDeskFormPanel");
    expect(source()).toContain("RecentlyRecordedCard");
    expect(source()).not.toContain("MoreActionButton");
    expect(source()).not.toContain("RECORD_DESK_EXTRA_ACTION_IDS");
  });

  it("routes confirmed uploads through openRecordActionWithFile", () => {
    expect(source()).toContain("openRecordActionWithFile");
    expect(source()).toContain("handleDocumentConfirm");
  });
});

describe("Record desk v3 tiles", () => {
  it("defines nine tiles in three rows without a Salary tile", () => {
    const tiles = sourceDeclaring("RECORD_DESK_TILES");
    expect(tiles).toContain('"sales"');
    expect(tiles).toContain('"expense"');
    expect(tiles).toContain('"payment"');
    expect(tiles).toContain('"transfer"');
    expect(tiles).toContain('"split"');
    expect(tiles).toContain('"fx"');
    expect(tiles).toContain('"addDocument"');
    expect(tiles).toContain('"countCash"');
    expect(tiles).toContain('"closeDay"');
    expect(tiles).not.toContain('"staffSalary"');
    expect(tiles).not.toContain("Briefcase");
  });

  it("uses a three-column icon grid", () => {
    expect(sourceDeclaring("RecordDeskIconGrid")).toContain("grid-cols-3");
  });

  it("keeps a comfortable icon rail so tiles stay readable", () => {
    const grid = sourceDeclaring("RecordDeskIconGrid");
    const panel = sourceDeclaring("RecordDeskFormPanel");
    expect(grid).toContain("lg:w-56");
    expect(grid).toContain("gap-4");
    expect(grid).toContain("min-h-[5.25rem]");
    expect(grid).toContain("p-4");
    expect(grid).toContain('size="xl"');
    expect(grid).not.toContain("lg:w-48");
    expect(panel).toContain("min-w-0 flex-1");
    expect(panel).not.toContain("lg:max-w-2xl");
  });
});

describe("Record payment panel", () => {
  it("defaults to Staff before Supplier and Customer", () => {
    const src = sourceDeclaring("RecordPaymentPanel");
    const staff = src.indexOf('label: "Staff"');
    const supplier = src.indexOf('label: "Supplier"');
    const customer = src.indexOf('label: "Customer"');
    expect(staff).toBeGreaterThan(-1);
    expect(staff).toBeLessThan(supplier);
    expect(supplier).toBeLessThan(customer);
    expect(src).toContain("useState(0)");
  });
});
