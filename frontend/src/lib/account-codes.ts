/** Chart-of-account codes the frontend refers to, in one place.
 *
 * These are the backend's numbers. `backend/app/core/chart_of_accounts/
 * default_chart.py` seeds the chart and names most of them as constants; this
 * file is the frontend's half, and `account-codes-match-backend.test.ts`
 * compares the two.
 *
 * **Why a guard rather than a convention.** The codes were bare literals
 * scattered across five files, and one of them was wrong: the set meant to
 * keep FX Gain out of the manual cash-in picker listed `4400`, which is not
 * in the chart at all. FX Gain is `4200`. So the account the comment said to
 * hide was offered for selection, and picking it would credit FX Gain by hand
 * against the flow that already posts it — double-counting a currency gain,
 * in a picker that looked perfectly ordinary.
 *
 * Nothing failed. A filter that excludes a code nobody uses excludes nothing,
 * and there is no way to see that from the call site.
 */

/** Retained earnings — where the year-end close lands. */
export const RETAINED_EARNINGS_CODE = "3100";

/** FX gain. Posted by the currency flow itself, never chosen by hand. */
export const FX_GAIN_CODE = "4200";

/** Group sales revenue. Posted by the group-sale flow. */
export const GROUP_SALES_REVENUE_CODE = "4300";

/** Salaries. Posted by payroll. */
export const SALARY_EXPENSE_CODE = "5100";

/** The catch-all expense, and the sensible default in every picker. */
export const GENERAL_EXPENSE_CODE = "5200";

/** Cash over/short — posted by the drawer count, not chosen. */
export const CASH_OVER_SHORT_CODE = "5400";

/** Delivery platform commission. Posted from a commission invoice. */
export const DELIVERY_COMMISSION_EXPENSE_CODE = "5500";

/** Sales discount. Posted by the discount flow. */
export const SALES_DISCOUNT_CODE = "5800";
