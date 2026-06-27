import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { isPeriodLockError, withPeriodUnlockReason } from "@/lib/period-unlock";

describe("isPeriodLockError", () => {
  it("detects owner unlock-required message", () => {
    const err = new ApiError(
      "period_unlock_reason is required for owner writes in a closed period",
      422,
    );
    expect(isPeriodLockError(err)).toBe(true);
  });

  it("detects closed period without owner-unlock suffix", () => {
    const err = new ApiError("dates fall in a closed period", 422);
    expect(isPeriodLockError(err)).toBe(true);
  });

  it("detects closed period with owner unlock suffix", () => {
    const err = new ApiError(
      "one or more dates fall in a closed period; owner unlock required",
      422,
    );
    expect(isPeriodLockError(err)).toBe(true);
  });

  it("rejects unrelated 422 errors", () => {
    expect(isPeriodLockError(new ApiError("invalid amount", 422))).toBe(false);
    expect(isPeriodLockError(new Error("network"))).toBe(false);
  });
});

describe("withPeriodUnlockReason", () => {
  it("adds reason when provided", () => {
    expect(
      withPeriodUnlockReason({ actor_id: "x" }, "Correcting closed day"),
    ).toEqual({
      actor_id: "x",
      period_unlock_reason: "Correcting closed day",
    });
  });

  it("leaves payload unchanged when reason empty", () => {
    const payload = { actor_id: "x" };
    expect(withPeriodUnlockReason(payload, "")).toBe(payload);
    expect(withPeriodUnlockReason(payload)).toBe(payload);
  });
});
