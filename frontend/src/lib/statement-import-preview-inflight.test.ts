import { describe, expect, it } from "vitest";

import type { StatementPreviewLoadResult } from "@/lib/statement-import-preview-inflight";
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
    let resolve!: (value: StatementPreviewLoadResult) => void;
    const promise = new Promise<StatementPreviewLoadResult>((r) => {
      resolve = r;
    });
    const key = "ent:acct:stmt.csv:1:2";
    trackInflightStatementPreview(key, promise);
    expect(getInflightStatementPreview(key)).toBe(promise);

    resolve({
      preview: {
        rows: [["a"]],
        total_rows: 1,
        csv_encoding: null,
        csv_delimiter: null,
        suggested_profile: null,
      },
      mapping: {
        headerRow: 0,
        dataStartRow: 1,
        dataEndRow: null,
        dateCol: 0,
        descriptionCol: 1,
        descriptionExtraCol: null,
        referenceCol: null,
        amountMode: "signed",
        amountCol: 2,
        debitCol: null,
        creditCol: null,
        dateFormat: "DD.MM.YYYY",
        decimalFormat: "tr",
        csvEncoding: "auto",
        csvDelimiter: "auto",
        debitIsOutflow: true,
        saveProfile: false,
      },
      autoDetected: false,
    });
    await promise;
    expect(getInflightStatementPreview(key)).toBeUndefined();
  });
});
