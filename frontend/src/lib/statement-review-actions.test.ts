import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyStatementLine,
  correctStatementLine,
  createSupplierFromStatementLine,
} from "@/lib/statement-review-actions";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

const mockedFetch = vi.mocked(apiFetch);

describe("statement-review-actions", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({ line: { id: "line-1" } });
  });

  it("confirm calls classify endpoint", async () => {
    await classifyStatementLine(
      "entity-1",
      "stmt-1",
      "line-1",
      { classification: "bank_fee", actor_id: "actor-1" },
      "idem-1",
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "/entities/entity-1/banking/statements/stmt-1/lines/line-1/classify",
      expect.objectContaining({
        method: "PATCH",
        idempotencyKey: "idem-1",
        body: JSON.stringify({
          classification: "bank_fee",
          actor_id: "actor-1",
        }),
      }),
    );
  });

  it("correct calls correct endpoint with reason", async () => {
    await correctStatementLine(
      "entity-1",
      "stmt-1",
      "line-1",
      {
        classification: "unknown",
        actor_id: "actor-1",
        reason: "Wrong fee",
      },
      "idem-2",
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "/entities/entity-1/banking/statements/stmt-1/lines/line-1/correct",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: "idem-2",
        body: JSON.stringify({
          classification: "unknown",
          actor_id: "actor-1",
          reason: "Wrong fee",
        }),
      }),
    );
  });

  it("create-supplier sends match_token for learning", async () => {
    await createSupplierFromStatementLine(
      "entity-1",
      "stmt-1",
      "line-1",
      { name: "Migros", match_token: "MIGROS" },
      "idem-3",
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      "/entities/entity-1/banking/statements/stmt-1/lines/line-1/create-supplier",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: "idem-3",
        body: JSON.stringify({ name: "Migros", match_token: "MIGROS" }),
      }),
    );
  });
});
