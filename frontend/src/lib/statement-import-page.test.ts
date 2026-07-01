import { describe, expect, it } from "vitest";

import {
  shouldStartAccountFetchLoading,
  statementImportPagePhase,
} from "@/lib/statement-import-page";

describe("statementImportPagePhase", () => {
  it("waits for entity list before showing import UI", () => {
    expect(
      statementImportPagePhase({
        entityId: "ent-1",
        entitiesLoaded: false,
        sessionValidated: false,
        loading: false,
        error: null,
      }),
    ).toBe("wait-entities");
  });

  it("waits for bank account on first visit", () => {
    expect(
      statementImportPagePhase({
        entityId: "ent-1",
        entitiesLoaded: true,
        sessionValidated: false,
        loading: true,
        error: null,
      }),
    ).toBe("wait-account");
  });

  it("stays ready after session validated even if loading flips true", () => {
    expect(
      statementImportPagePhase({
        entityId: "ent-1",
        entitiesLoaded: true,
        sessionValidated: true,
        loading: true,
        error: null,
      }),
    ).toBe("ready");
  });

  it("shows error only before first successful validation", () => {
    expect(
      statementImportPagePhase({
        entityId: "ent-1",
        entitiesLoaded: true,
        sessionValidated: false,
        loading: false,
        error: "Load failed",
      }),
    ).toBe("error");
  });
});

describe("shouldStartAccountFetchLoading", () => {
  it("blocks UI only until the bank account is validated once", () => {
    expect(shouldStartAccountFetchLoading(false)).toBe(true);
    expect(shouldStartAccountFetchLoading(true)).toBe(false);
  });
});
