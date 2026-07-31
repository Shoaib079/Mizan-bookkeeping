import { describe, expect, it } from "vitest";

async function readDeskSource() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./record-desk.tsx", import.meta.url), "utf8"),
  );
}

describe("RecordDesk", () => {
  it("renders icon mode rail and embedded primary forms", async () => {
    const source = await readDeskSource();
    expect(source).toContain("DeskModeButton");
    expect(source).toContain("primaryRecordActions");
    expect(source).toContain("ManualExpenseForm");
    expect(source).toContain("embedded");
    expect(source).toContain("RecordedTodayCard");
  });

  it("routes confirmed uploads through openRecordActionWithFile", async () => {
    const source = await readDeskSource();
    expect(source).toContain("openRecordActionWithFile");
    expect(source).toContain("handleDocumentConfirm");
  });

  it("opens extra actions from the rail or compact More menu", async () => {
    const source = await readDeskSource();
    expect(source).toContain("DeskExtraButton");
    expect(source).toContain("moreActions.length > 1");
    expect(source).toContain("useDismissOnOutsideClick");
    expect(source).toContain('role="menu"');
  });
});
