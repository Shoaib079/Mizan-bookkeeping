/** Tab sections + route reachability registry (IA audit v0.71.9). */

import { NEW_COMMAND_QUICK_ACTIONS } from "@/lib/record-actions";
import { LEGACY_REVIEW_REDIRECTS } from "@/lib/review-routes";

export { NEW_COMMAND_QUICK_ACTIONS, LEGACY_REVIEW_REDIRECTS };

export type NavTab = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  /** Hidden when delivery module is off for the entity. */
  requiresDelivery?: boolean;
};

export type NavSectionId =
  | "sales"
  | "banking"
  | "suppliers"
  | "customers"
  | "balances"
  | "review"
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
    ],
  },
  {
    id: "balances",
    sidebarHref: "/balances",
    tabs: [
      {
        href: "/balances/suppliers",
        label: "Suppliers",
        match: (path) => path === "/balances/suppliers" || path === "/payables",
      },
      {
        href: "/balances/customers",
        label: "Customers",
        match: (path) => path === "/balances/customers" || path === "/receivables",
      },
      {
        href: "/balances/staff",
        label: "Staff",
        match: (path) => path === "/balances/staff",
      },
      {
        href: "/balances/partners",
        label: "Partners",
        match: (path) => path === "/balances/partners",
      },
      {
        href: "/balances/cash",
        label: "Cash & bank",
        match: (path) => path === "/balances/cash",
      },
    ],
  },
  {
    id: "review",
    sidebarHref: "/review",
    tabs: [
      {
        href: "/review/bank",
        label: "Bank & card",
        match: (path) => path === "/review/bank" || path === "/banking/review",
      },
      {
        href: "/review/sales",
        label: "Sales",
        match: (path) => path === "/review/sales",
      },
      {
        href: "/review/receipts",
        label: "Receipts",
        match: (path) =>
          path === "/review/receipts" || path.startsWith("/review/receipts/"),
      },
      {
        href: "/review/invoices",
        label: "Invoices",
        match: (path) =>
          path === "/review/invoices" || path.startsWith("/review/invoices/"),
      },
      {
        href: "/review/delivery",
        label: "Delivery",
        requiresDelivery: true,
        match: (path) => path === "/review/delivery",
      },
      {
        href: "/review/posted",
        label: "All posted",
        match: (path) => path === "/review/posted",
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
  "/balances/suppliers",
  "/balances/customers",
  "/balances/staff",
  "/balances/partners",
  "/balances/cash",
  "/review/bank",
  "/review/sales",
  "/review/receipts",
  "/review/invoices",
  "/review/delivery",
  "/review/posted",
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
  "/accounting/manual-journals",
] as const;

export type RouteEntryKind =
  | "sidebar"
  | "tab"
  | "reports-card"
  | "drill-down"
  | "auth"
  | "redirect";

/** Static page routes (45 app pages) — used by reachability guard test. */
/** Old bookmark URLs that redirect into the Balances hub (UX2). */
export const LEGACY_BALANCE_REDIRECTS: Record<string, string> = {
  "/payables": "/balances/suppliers",
  "/receivables": "/balances/customers",
};

export const REGISTERED_PAGE_ROUTES: { pattern: string; kind: RouteEntryKind }[] = [
  { pattern: "/", kind: "sidebar" },
  { pattern: "/record", kind: "sidebar" },
  { pattern: "/review", kind: "sidebar" },
  { pattern: "/review/bank", kind: "tab" },
  { pattern: "/review/sales", kind: "tab" },
  { pattern: "/review/receipts", kind: "tab" },
  { pattern: "/review/invoices", kind: "tab" },
  { pattern: "/review/delivery", kind: "tab" },
  { pattern: "/review/posted", kind: "tab" },
  { pattern: "/balances", kind: "sidebar" },
  { pattern: "/balances/suppliers", kind: "tab" },
  { pattern: "/balances/customers", kind: "tab" },
  { pattern: "/balances/staff", kind: "tab" },
  { pattern: "/balances/partners", kind: "tab" },
  { pattern: "/balances/cash", kind: "tab" },
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
  { pattern: "/payables", kind: "redirect" },
  { pattern: "/staff", kind: "sidebar" },
  { pattern: "/staff/[id]", kind: "drill-down" },
  { pattern: "/partners", kind: "sidebar" },
  { pattern: "/partners/[id]", kind: "drill-down" },
  { pattern: "/customers", kind: "tab" },
  { pattern: "/customers/[id]", kind: "drill-down" },
  { pattern: "/receivables", kind: "redirect" },
  { pattern: "/banking", kind: "tab" },
  { pattern: "/banking/review", kind: "redirect" },
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
  { pattern: "/reports/ledger", kind: "redirect" },
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
  if (sidebarHref === "/record") return pathname === "/record";
  if (sidebarHref === "/review") {
    return (
      pathname === "/review" ||
      pathname.startsWith("/review/") ||
      pathname === "/banking/review"
    );
  }
  if (sidebarHref === "/balances") {
    return (
      pathname === "/balances" ||
      pathname.startsWith("/balances/") ||
      pathname === "/payables" ||
      pathname === "/receivables"
    );
  }
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
    "/record": "Record",
    "/review": "Review",
    "/review/bank": "Review",
    "/review/sales": "Review",
    "/review/receipts": "Review",
    "/review/invoices": "Review",
    "/review/delivery": "Review",
    "/review/posted": "Review",
    "/balances": "Balances",
    "/balances/suppliers": "Balances",
    "/balances/customers": "Balances",
    "/balances/staff": "Balances",
    "/balances/partners": "Balances",
    "/balances/cash": "Balances",
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
