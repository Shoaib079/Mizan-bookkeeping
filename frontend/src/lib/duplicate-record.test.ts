import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  isDuplicateRecordError,
  withAcknowledgeDuplicate,
} from "@/lib/duplicate-record";

describe("isDuplicateRecordError", () => {
  it("detects structured duplicate_record 409", () => {
    const err = new ApiError("An expense for ₺150,00 already exists.", 409, {
      code: "duplicate_record",
      message: "An expense for ₺150,00 already exists.",
      record_kind: "expense",
      existing_id: "abc",
    });
    expect(isDuplicateRecordError(err)).toBe(true);
  });

  it("rejects plain 409 conflicts", () => {
    const err = new ApiError("Entity slug already taken", 409, "Entity slug already taken");
    expect(isDuplicateRecordError(err)).toBe(false);
  });
});

describe("withAcknowledgeDuplicate", () => {
  it("adds flag only when acknowledged", () => {
    expect(withAcknowledgeDuplicate({ amount_kurus: 100 }, false)).toEqual({
      amount_kurus: 100,
    });
    expect(withAcknowledgeDuplicate({ amount_kurus: 100 }, true)).toEqual({
      amount_kurus: 100,
      acknowledge_duplicate: true,
    });
  });
});
