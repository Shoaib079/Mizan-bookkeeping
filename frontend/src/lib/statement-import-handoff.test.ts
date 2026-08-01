import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginStatementImportHandoff,
  peekStatementImportFileHandoff,
  storeStatementImportFileHandoff,
  takeStatementImportFileHandoff,
  takeStatementImportPreviewResult,
} from "@/lib/statement-import-handoff";
import { getInflightStatementPreview } from "@/lib/statement-import-preview-inflight";
import {
  readStatementImportPending,
  statementImportStorageKey,
} from "@/lib/statement-import-session";

vi.mock("@/lib/statement-import-preview-fetch", () => ({
  fetchStatementPreviewResult: vi.fn(() =>
    Promise.resolve({
      preview: {
        rows: [["Date", "Amount"], ["2026-01-01", "100"]],
        total_rows: 2,
        csv_encoding: null,
        csv_delimiter: null,
        suggested_profile: null,
      },
      mapping: {},
      autoDetected: false,
    }),
  ),
}));

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
});

describe("statement import file handoff", () => {
  it("stores and takes the file once", () => {
    const file = new File(["a"], "stmt.csv", { type: "text/csv" });
    storeStatementImportFileHandoff("ent:acct", file);
    expect(takeStatementImportFileHandoff("ent:acct")).toBe(file);
    expect(takeStatementImportFileHandoff("ent:acct")).toBeNull();
  });

  it("writes pending metadata and starts inflight preview", () => {
    const file = new File(["a"], "stmt.csv", {
      type: "text/csv",
      lastModified: 1_700_000_000_000,
    });
    Object.defineProperty(file, "size", { value: 12 });

    beginStatementImportHandoff({
      entityId: "ent-1",
      moneyAccountId: "acct-1",
      file,
    });

    const storageKey = statementImportStorageKey("ent-1", "acct-1");
    expect(readStatementImportPending(storageKey)).toEqual({
      fileName: "stmt.csv",
      fileSize: 12,
      fileLastModified: 1_700_000_000_000,
    });
    expect(
      getInflightStatementPreview(
        `${storageKey}:stmt.csv:12:1700000000000`,
      ),
    ).toBeDefined();
    expect(peekStatementImportFileHandoff(storageKey)).toBe(file);
    expect(takeStatementImportFileHandoff(storageKey)).toBe(file);
  });

  it("stores completed preview for late import panel mount", async () => {
    const file = new File(["a"], "stmt.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: 12 });

    beginStatementImportHandoff({
      entityId: "ent-1",
      moneyAccountId: "acct-1",
      file,
    });

    const storageKey = statementImportStorageKey("ent-1", "acct-1");
    await vi.waitFor(() => {
      expect(takeStatementImportPreviewResult(storageKey)).not.toBeNull();
    });
  });
});
