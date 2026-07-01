import { describe, expect, it } from "vitest";

import {
  applyColumnAssignment,
  colLabel,
  colLetter,
  columnOptionLabel,
  columnSelectionHint,
  DEFAULT_MAPPING,
  headerCellAt,
  roleForColumn,
  sampleCellAt,
  statementImportSessionKey,
  truncateCell,
} from "@/lib/statement-import-helpers";

const PREVIEW = {
  rows: [
    ["junk"],
    ["Tarih", "Aciklama", "Borc", "Alacak"],
    ["01.02.2026", "Odeme", "100,00", ""],
  ],
};

describe("statement import column labels", () => {
  it("maps indices to Excel-style letters", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(1)).toBe("B");
    expect(colLetter(25)).toBe("Z");
    expect(colLabel(3)).toBe("D (3)");
  });
});

describe("statement import column context", () => {
  it("reads header and sample cells from preview rows", () => {
    expect(headerCellAt(PREVIEW, 2, 0)).toBe("Tarih");
    expect(sampleCellAt(PREVIEW, 3, 1)).toBe("Odeme");
  });

  it("builds readable dropdown labels", () => {
    expect(columnOptionLabel(0, "Tarih", "01.02.2026")).toContain("A");
    expect(columnOptionLabel(0, "Tarih", "01.02.2026")).toContain("Tarih");
    expect(columnSelectionHint(0, "Tarih", "01.02.2026")).toContain("01.02.2026");
  });

  it("truncates long cell text", () => {
    expect(truncateCell("abcdefghijklmnop", 10)).toBe("abcdefghi…");
  });

  it("applies click-to-assign mapping", () => {
    const next = applyColumnAssignment(DEFAULT_MAPPING, "date", 2);
    expect(next.dateCol).toBe(2);
    expect(roleForColumn(next, 2)).toBe("date");
  });
});

describe("statementImportSessionKey", () => {
  it("combines entity and account for switch-reset tracking", () => {
    expect(statementImportSessionKey("ent-1", "acct-1")).toBe("ent-1:acct-1");
    expect(statementImportSessionKey("ent-1", "acct-2")).not.toBe(
      statementImportSessionKey("ent-1", "acct-1"),
    );
  });
});
