/** Tab sections + route reachability registry (IA audit v0.71.9). */

import type { QuickActionKey } from "@/components/quick-actions";

export type NavTab = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

export type NavSectionId =
  | "sales"
  | "banking"
  | "suppliers"
  | "customers"
  | "settings"
  | "delivery";

export type NavSection = {
  id: NavSectionId;
  /** Sidebar row href — parent highlight when any tab or drill-down matches. */
  sidebarHref: string;
  tabs: NavTab[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "sales",
    sidebarHref: "/sales",
    tabs: [
      {
        href: "/sales",
        label: "Daily sales",
        match: (path) => path === "/sales" || path.startsWith("/sales/"),
      },
      {
        href: "/cards",
        label: "Card clearing",
        match: (path) => path === "/cards" || path.startsWith("/cards/"),
      },
      {
        href: "/close-day",
        label: "Close day",
        match: (path) => path === "/close-day",
      },
    ],
  },
  {
    id: "delivery",
    sidebarHref: "/delivery",
    tabs: [
      { href: "/delivery", label: "Overview", match: (path) => path === "/delivery" },
      {
        href: "/delivery/platforms",
        label: "Platforms",
        match: (path) => path === "/delivery/platforms",
      },
      {
        href: "/delivery/reports",
        label: "Reports",
        match: (path) => path.startsWith("/delivery/reports"),
      },
      {
        href: "/delivery/settlements",
        label: "Settlements",
        match: (path) => path === "/delivery/settlements",
      },
    ],
  },
  {
    id: "banking",
    sidebarHref: "/banking",
    tabs: [
      {
        href: "/banking",
        label: "Accounts",
        match: (path) =>
          path === "/banking" ||
          path.startsWith("/banking/accounts/") ||
          path.startsWith("/banking/statements/") ||
          path.startsWith("/banking/fx/"),
      },
      {
        href: "/banking/review",
        label: "Review",
        match: (path) => path === "/banking/review",
      },
      {
        href: "/banking/transfers",
        label: "Transfers",
        match: (path) => path === "/banking/transfers",
      },
      {
        href: "/banking/cash",
        label: "Cash drawer",
        match: (path) => path === "/banking/cash",
      },
    ],
  },
  {
    id: "suppliers",
    sidebarHref: "/suppliers",
    tabs: [
      {
        href: "/suppliers",
        label: "Directory",
        match: (path) => path === "/suppliers" || path.startsWith("/suppliers/"),
      },
      {
        href: "/payables",
        label: "Payables",
        match: (path) => path === "/payables",
      },
    ],
  },
  {
    id: "customers",
    sidebarHref: "/customers",
    tabs: [
      {
        href: "/customers",
        label: "Directory",
        match: (path) => path === "/customers" || path.startsWith("/customers/"),
      },
      {
        href: "/receivables",
        label: "Receivables",
        match: (path) => path === "/receivables",
      },
    ],
  },
  {
    id: "settings",
    sidebarHref: "/settings",
    tabs: [
      {
        href: "/settings/entity",
        label: "Restaurant & toggles",
        match: (path) => path === "/settings/entity",
      },
      {
        href: "/settings/opening-balances",
        label: "Opening balances",
        match: (path) => path === "/settings/opening-balances",
      },
      {
        href: "/settings/members",
        label: "Members",
        match: (path) => path === "/settings/members",
      },
      {
        href: "/settings/expense-items",
        label: "Expense items",
        match: (path) => path === "/settings/expense-items",
      },
    ],
  },
];

/** Routes registered in appRoutes but hidden from sidebar (reachable via tabs/cards). */
export const SIDEBAR_HIDDEN_HREFS = new Set([
  "/close-day",
  "/cards",
  "/payables",
  "/receivables",
  "/banking/transfers",
  "/banking/cash",
  "/settings/entity",
  "/settings/opening-balances",
  "/settings/members",
  "/settings/expense-items",
  "/reports/ledger",
  "/accounting/manual-journals",
  "/delivery/platforms",
  "/delivery/reports",
  "/delivery/settlements",
]);

export const REPORTS_CARD_HREFS = [
  "/reports/profit-and-loss",
  "/reports/balance-sheet",
  "/reports/cash-flow",
  "/reports/kdv-input",
  "/reports/delivery-sales",
  "/reports/period-comparison",
  "/reports/ledger",
  "/accounting/manual-journals",
] as const;

export type RouteEntryKind = "sidebar" | "tab" | "reports-card" | "drill-down" | "auth";

/** Static page routes (45 app pages) — used by reachability guard test. */
export const REGISTERED_PAGE_ROUTES: { pattern: string; kind: RouteEntryKind }[] = [
  { pattern: "/", kind: "sidebar" },
  { pattern: "/sales", kind: "tab" },
  { pattern: "/sales/[id]", kind: "drill-down" },
  { pattern: "/cards", kind: "tab" },
  { pattern: "/close-day", kind: "tab" },
  { pattern: "/delivery", kind: "tab" },
  { pattern: "/delivery/platforms", kind: "tab" },
  { pattern: "/delivery/reports", kind: "tab" },
  { pattern: "/delivery/reports/[id]", kind: "drill-down" },
  { pattern: "/delivery/settlements", kind: "tab" },
  { pattern: "/expenses", kind: "sidebar" },
  { pattern: "/uploads", kind: "sidebar" },
  { pattern: "/suppliers", kind: "tab" },
  { pattern: "/suppliers/[id]", kind: "drill-down" },
  { pattern: "/payables", kind: "tab" },
  { pattern: "/staff", kind: "sidebar" },
  { pattern: "/staff/[id]", kind: "drill-down" },
  { pattern: "/partners", kind: "sidebar" },
  { pattern: "/partners/[id]", kind: "drill-down" },
  { pattern: "/customers", kind: "tab" },
  { pattern: "/customers/[id]", kind: "drill-down" },
  { pattern: "/receivables", kind: "tab" },
  { pattern: "/banking", kind: "tab" },
  { pattern: "/banking/review", kind: "tab" },
  { pattern: "/banking/transfers", kind: "tab" },
  { pattern: "/banking/cash", kind: "tab" },
  { pattern: "/banking/accounts/[id]", kind: "drill-down" },
  { pattern: "/banking/statements/[id]", kind: "drill-down" },
  { pattern: "/banking/fx/[id]", kind: "drill-down" },
  { pattern: "/reports", kind: "sidebar" },
  { pattern: "/reports/profit-and-loss", kind: "reports-card" },
  { pattern: "/reports/balance-sheet", kind: "reports-card" },
  { pattern: "/reports/cash-flow", kind: "reports-card" },
  { pattern: "/reports/kdv-input", kind: "reports-card" },
  { pattern: "/reports/delivery-sales", kind: "reports-card" },
  { pattern: "/reports/period-comparison", kind: "reports-card" },
  { pattern: "/reports/ledger", kind: "reports-card" },
  { pattern: "/accounting/manual-journals", kind: "reports-card" },
  { pattern: "/settings", kind: "sidebar" },
  { pattern: "/settings/entity", kind: "tab" },
  { pattern: "/settings/opening-balances", kind: "tab" },
  { pattern: "/settings/members", kind: "tab" },
  { pattern: "/settings/expense-items", kind: "tab" },
  { pattern: "/review/receipts/[id]", kind: "drill-down" },
  { pattern: "/review/invoices/[id]", kind: "drill-down" },
  { pattern: "/sign-in/[[...sign-in]]", kind: "auth" },
  { pattern: "/sign-up/[[...sign-up]]", kind: "auth" },
];

export const NEW_COMMAND_QUICK_ACTIONS: Record<string, QuickActionKey> = {
  "New: Manual expense": "expense",
  "New: Daily sales (manual)": "sales",
  "New: Buy foreign currency": "buyFx",
  "New: POS summary (photo)": "posPhoto",
  "New: Delivery report": "deliveryReport",
  "New: Expense receipt (photo)": "receipt",
  "New: Supplier": "supplier",
  "New: Supplier invoice (e-Fatura)": "efatura",
};

export function navSectionForPathname(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) =>
    section.tabs.some((tab) => tab.match(pathname)),
  );
}

export function navSectionById(id: NavSectionId): NavSection {
  const section = NAV_SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`Unknown nav section ${id}`);
  return section;
}

export function sidebarHrefActiveForPathname(
  sidebarHref: string,
  pathname: string,
): boolean {
  const section = NAV_SECTIONS.find((entry) => entry.sidebarHref === sidebarHref);
  if (section) {
    if (pathname === section.sidebarHref) return true;
    return section.tabs.some((tab) => tab.match(pathname));
  }
  if (sidebarHref === "/") return pathname === "/";
  if (sidebarHref === "/reports") {
    return (
      pathname === "/reports" ||
      pathname.startsWith("/reports/") ||
      pathname.startsWith("/accounting/")
    );
  }
  return pathname === sidebarHref || pathname.startsWith(`${sidebarHref}/`);
}

export function pageTitleForPathname(pathname: string): string {
  if (pathname.startsWith("/delivery/reports/") && pathname !== "/delivery/reports") {
    return "Review delivery report";
  }
  const tab = NAV_SECTIONS.flatMap((s) => s.tabs).find((t) => t.match(pathname));
  if (tab && tab.href !== "/settings" && tab.href !== "/delivery") {
    return tab.label;
  }
  const titles: Record<string, string> = {
    "/": "Dashboard",
    "/expenses": "Expenses",
    "/uploads": "Documents",
    "/staff": "Staff",
    "/partners": "Partners",
    "/reports": "Reports",
    "/settings": "Settings",
    "/delivery": "Delivery",
    "/sales": "Daily sales",
  };
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/staff/")) return "Staff member";
  if (pathname.startsWith("/partners/")) return "Partner";
  if (pathname.startsWith("/suppliers/")) return "Supplier";
  if (pathname.startsWith("/customers/")) return "Customer";
  if (pathname.startsWith("/banking/accounts/")) return "Account";
  if (pathname.startsWith("/banking/statements/")) return "Statement review";
  if (pathname.startsWith("/banking/fx/")) return "FX wallet";
  if (pathname.startsWith("/sales/")) return "Review daily sales";
  if (pathname.startsWith("/review/receipts/")) return "Review expense receipt";
  if (pathname.startsWith("/review/invoices/")) return "Review supplier invoice";
  if (pathname.startsWith("/reports/")) return "Report";
  if (pathname.startsWith("/accounting/")) return "Manual journals";
  return "Mizan";
}
