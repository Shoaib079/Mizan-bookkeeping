/** Workspace settings routes + legacy redirects (settings reorg). */

export const WORKSPACE_ROUTES = {
  restaurant: "/settings/restaurant",
  profile: "/settings/profile",
  openingBalances: "/onboarding/opening-balances",
  expenseItems: "/review/expenses?view=items",
  deliveryPlatforms: "/delivery/platforms",
  banking: "/banking",
  manualJournals: "/review/manual-journals",
} as const;

/** Canonical hrefs for workspace / onboarding flows. */
export const SETUP_TAB_HREFS = {
  restaurant: WORKSPACE_ROUTES.restaurant,
  openingBalances: WORKSPACE_ROUTES.openingBalances,
  members: WORKSPACE_ROUTES.restaurant,
  expenseItems: WORKSPACE_ROUTES.expenseItems,
  deliveryPlatforms: WORKSPACE_ROUTES.deliveryPlatforms,
  accounts: WORKSPACE_ROUTES.banking,
  accountant: WORKSPACE_ROUTES.manualJournals,
  backups: WORKSPACE_ROUTES.restaurant,
} as const;

/** Old bookmark URLs → canonical routes. */
export const LEGACY_SETUP_REDIRECTS: Record<string, string> = {
  "/settings": WORKSPACE_ROUTES.restaurant,
  "/settings/entity": WORKSPACE_ROUTES.restaurant,
  "/settings/opening-balances": WORKSPACE_ROUTES.openingBalances,
  "/settings/members": WORKSPACE_ROUTES.restaurant,
  "/settings/expense-items": WORKSPACE_ROUTES.expenseItems,
  "/expenses/items": WORKSPACE_ROUTES.expenseItems,
  "/delivery/platforms": WORKSPACE_ROUTES.deliveryPlatforms,
  "/accounting/manual-journals": WORKSPACE_ROUTES.manualJournals,
  "/setup": WORKSPACE_ROUTES.restaurant,
  "/setup/restaurant": WORKSPACE_ROUTES.restaurant,
  "/setup/opening-balances": WORKSPACE_ROUTES.openingBalances,
  "/setup/members": WORKSPACE_ROUTES.restaurant,
  "/setup/expense-items": WORKSPACE_ROUTES.expenseItems,
  "/setup/delivery-platforms": WORKSPACE_ROUTES.deliveryPlatforms,
  "/setup/accounts": WORKSPACE_ROUTES.banking,
  "/setup/accountant": WORKSPACE_ROUTES.manualJournals,
  "/setup/backups": WORKSPACE_ROUTES.restaurant,
};
