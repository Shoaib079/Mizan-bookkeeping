import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";

describe("apiErrorMessage", () => {
  it("returns ApiError message", () => {
    expect(apiErrorMessage(new ApiError("Dashboard unavailable", 503))).toBe(
      "Dashboard unavailable",
    );
  });

  it("returns generic Error message", () => {
    expect(apiErrorMessage(new Error("Network down"))).toBe("Network down");
  });

  it("returns fallback for unknown values", () => {
    expect(apiErrorMessage(null, "Could not load summary")).toBe(
      "Could not load summary",
    );
  });
});
