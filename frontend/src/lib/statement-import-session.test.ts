import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_MAPPING } from "@/lib/statement-import-helpers";
import {
  fileMatchesSession,
  readStatementImportSession,
  statementImportStorageKey,
  type StatementImportSession,
  writeStatementImportSession,
} from "@/lib/statement-import-session";

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

const PREVIEW = {
  rows: [["Date", "Amount"], ["2026-01-01", "100"]],
  total_rows: 2,
  csv_encoding: null,
  csv_delimiter: null,
  suggested_profile: null,
};

describe("statementImportStorageKey", () => {
  it("scopes storage per entity and bank account", () => {
    expect(statementImportStorageKey("ent-1", "acct-1")).toBe(
      "mizan.statementImport.v1:ent-1:acct-1",
    );
  });
});

describe("statement import session persistence", () => {
  const key = statementImportStorageKey("ent-1", "acct-1");
  const session: StatementImportSession = {
    step: "map",
    preview: PREVIEW,
    mapping: DEFAULT_MAPPING,
    fileName: "feb.csv",
    fileSize: 180_000,
    fileLastModified: 1_700_000_000_000,
  };

  it("round-trips preview + mapping through sessionStorage", () => {
    writeStatementImportSession(key, session);
    expect(readStatementImportSession(key)).toEqual(session);
  });

  it("matches file metadata for restore after remount", () => {
    const file = {
      name: "feb.csv",
      size: 180_000,
      lastModified: 1_700_000_000_000,
    } as File;
    expect(fileMatchesSession(file, session)).toBe(true);
    expect(
      fileMatchesSession({ ...file, name: "mar.csv" } as File, session),
    ).toBe(false);
  });
});
