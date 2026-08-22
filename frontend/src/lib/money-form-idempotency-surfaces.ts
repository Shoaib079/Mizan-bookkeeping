/** Money forms that mutate via apiFetch — must wire stable useSubmitIdempotency.

 * Listed by path under `src/` so a rename fails the guard instead of silently
 * dropping idempotency on a production-only 400.
 */
export const MONEY_FORM_IDEMPOTENCY_SURFACES = [
  "components/forms/group-sale-discount-dialog.tsx",
  "components/forms/group-sale-form.tsx",
  "components/forms/customer-payment-form.tsx",
] as const;

export type MoneyFormIdempotencySurface =
  (typeof MONEY_FORM_IDEMPOTENCY_SURFACES)[number];
