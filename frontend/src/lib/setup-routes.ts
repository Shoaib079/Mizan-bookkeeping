/** Set up hub routes and legacy redirects (UX5). */

export const SETUP_TAB_HREFS = {
  restaurant: "/setup/restaurant",
  openingBalances: "/setup/opening-balances",
  members: "/setup/members",
  expenseItems: "/setup/expense-items",
  deliveryPlatforms: "/setup/delivery-platforms",
  accounts: "/setup/accounts",
  accountant: "/setup/accountant",
  backups: "/setup/backups",
} as const;

/** Old bookmark URLs → Set up hub tabs. */
export const LEGACY_SETUP_REDIRECTS: Record<string, string> = {
  "/settings": "/setup/restaurant",
  "/settings/entity": "/setup/restaurant",
  "/settings/opening-balances": "/setup/opening-balances",
  "/settings/members": "/setup/members",
  "/settings/expense-items": "/setup/expense-items",
  "/delivery/platforms": "/setup/delivery-platforms",
  "/accounting/manual-journals": "/setup/accountant",
};
