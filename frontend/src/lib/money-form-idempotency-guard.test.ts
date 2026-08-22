/** Guard: listed money forms use stable useSubmitIdempotency, not one-shot keys. */

import { describe, expect, it } from "vitest";

import { MONEY_FORM_IDEMPOTENCY_SURFACES } from "@/lib/money-form-idempotency-surfaces";
import { sourceAt } from "@/test-support/source";

describe("money form idempotency surfaces", () => {
  it.each(MONEY_FORM_IDEMPOTENCY_SURFACES)(
    "%s wires useSubmitIdempotency with beginSubmit and completeSubmit",
    (relativePath) => {
      const src = sourceAt(relativePath);
      expect(src).toContain("useSubmitIdempotency");
      expect(src).toMatch(/beginSubmit\(\)/);
      expect(src).toMatch(/completeSubmit\(\)/);
      expect(src).toMatch(/idempotencyKey/);
    },
  );

  it("includes the group-sale discount dialog", () => {
    expect(MONEY_FORM_IDEMPOTENCY_SURFACES).toContain(
      "components/forms/group-sale-discount-dialog.tsx",
    );
  });

  it("mutation: fresh key per apiFetch call fails the guard", () => {
    const src = sourceAt("components/forms/group-sale-discount-dialog.tsx");
    expect(src).toMatch(/submitIdempotency\.beginSubmit\(\)/);
    const broken = src.replace(
      "submitIdempotency.beginSubmit()",
      "newIdempotencyKey()",
    );
    expect(broken).not.toMatch(/beginSubmit\(\)/);
  });
});
