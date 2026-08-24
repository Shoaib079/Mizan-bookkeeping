import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BankStatementRead } from "@/lib/banking-types";
import { DEFAULT_MAPPING } from "@/lib/statement-import-helpers";
import {
  statementImportSuccessToast,
  submitStatementImport,
} from "@/lib/statement-import-submit";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

const apiFetchMock = vi.mocked(apiFetch);

describe("statementImportSuccessToast", () => {
  it("reports duplicates when skipped_duplicate_count is set", () => {
    const statement = {
      line_count: 2,
      skipped_duplicate_count: 3,
    } as BankStatementRead;
    expect(statementImportSuccessToast(statement)).toBe(
      "Statement imported — 2 new lines, 3 duplicates skipped",
    );
  });

  it("uses singular wording for one new line and one duplicate", () => {
    const statement = {
      line_count: 1,
      skipped_duplicate_count: 1,
    } as BankStatementRead;
    expect(statementImportSuccessToast(statement)).toBe(
      "Statement imported — 1 new line, 1 duplicate skipped",
    );
  });

  it("falls back to a short toast when nothing was skipped", () => {
    const statement = {
      line_count: 5,
      skipped_duplicate_count: 0,
    } as BankStatementRead;
    expect(statementImportSuccessToast(statement)).toBe("Statement imported");
  });
});

describe("submitStatementImport", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("posts FormData to the account statements path with idempotency key", async () => {
    const statement = { id: "s1", line_count: 4 } as BankStatementRead;
    apiFetchMock.mockResolvedValue(statement);

    const file = new File(["x"], "stmt.csv", { type: "text/csv" });
    const result = await submitStatementImport({
      entityId: "e1",
      moneyAccountId: "a1",
      file,
      mapping: DEFAULT_MAPPING,
      idempotencyKey: "idem-1",
    });

    expect(result).toBe(statement);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0]!;
    expect(path).toBe("/entities/e1/banking/accounts/a1/statements");
    expect(init?.method).toBe("POST");
    expect(init?.idempotencyKey).toBe("idem-1");
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init!.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("save_profile")).toBe(
      DEFAULT_MAPPING.saveProfile ? "true" : "false",
    );
    expect(typeof body.get("profile")).toBe("string");
  });
});
