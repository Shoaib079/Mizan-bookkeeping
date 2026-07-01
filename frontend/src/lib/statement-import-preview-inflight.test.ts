import { describe, expect, it } from "vitest";

import {
  getInflightStatementPreview,
  statementPreviewInflightKey,
  trackInflightStatementPreview,
} from "@/lib/statement-import-preview-inflight";

describe("statementPreviewInflightKey", () => {
  it("keys by storage path and file metadata", () => {
    expect(
      statementPreviewInflightKey("ent:acct", {
        name: "stmt.csv",
        size: 180_000,
        lastModified: 1_700_000_000_000,
      }),
    ).toBe("ent:acct:stmt.csv:180000:1700000000000");
  });
});

describe("trackInflightStatementPreview", () => {
  it("dedupes concurrent loads and clears after settle", async () => {
    let resolve!: (value: {
      preview: { rows: string[][]; total_rows: number };
      mapping: { headerRow: number };
      autoDetected: boolean;
    }) => void;
    const promise = new Promise<{
      preview: { rows: string[][]; total_rows: number };
      mapping: { headerRow: number };
      autoDetected: boolean;
    }>((r) => {
      resolve = r;
    });
    const key = "ent:acct:stmt.csv:1:2";
    trackInflightStatementPreview(key, promise);
    expect(getInflightStatementPreview(key)).toBe(promise);

    resolve({
      preview: { rows: [["a"]], total_rows: 1 },
      mapping: { headerRow: 0 },
      autoDetected: false,
    });
    await promise;
    expect(getInflightStatementPreview(key)).toBeUndefined();
  });
});
