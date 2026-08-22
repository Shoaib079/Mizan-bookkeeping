import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("RecordDesk");

describe("RecordDesk", () => {
  it("renders icon mode rail and embedded primary forms", () => {
    expect(source()).toContain("DeskModeButton");
    expect(source()).toContain("primaryRecordActions");
    expect(source()).toContain("ManualExpenseForm");
    expect(source()).toContain("embedded");
    expect(source()).toContain("RecentlyRecordedCard");
  });

  it("routes confirmed uploads through openRecordActionWithFile", () => {
    expect(source()).toContain("openRecordActionWithFile");
    expect(source()).toContain("handleDocumentConfirm");
  });

  it("opens extra actions from the rail or compact More menu", () => {
    expect(source()).toContain("DeskExtraButton");
    expect(source()).toContain("moreActions.length > 1");
    expect(source()).toContain("useDismissOnOutsideClick");
    expect(source()).toContain('role="menu"');
  });
});
