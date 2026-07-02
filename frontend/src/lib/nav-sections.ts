/** Tab sections + route reachability registry (IA audit v0.71.9). */

import { NEW_COMMAND_QUICK_ACTIONS } from "@/lib/record-actions";
import {
  LEGACY_UPLOADS_REDIRECT,
  LEGACY_UPLOADS_REDIRECTS,
  pathnameMatchesBalancesIntent,
  pathnameMatchesRecordIntent,
} from "@/lib/intent-nav";
import { LEGACY_REVIEW_REDIRECTS } from "@/lib/review-routes";
import { LEGACY_SETUP_REDIRECTS } from "@/lib/setup-routes";

export {
  NEW_COMMAND_QUICK_ACTIONS,
  LEGACY_REVIEW_REDIRECTS,
  LEGACY_SETUP_REDIRECTS,
  LEGACY_UPLOADS_REDIRECT,
  LEGACY_UPLOADS_REDIRECTS,
};

export type NavTab = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  /** Hidden when delivery module is off for the entity. */
  requiresDelivery?: boolean;
  /** Hidden when role lacks financial_reports:read. */
  requiresFinancialReports?: boolean;
};

export type NavSectionId =
  | "sales"
  | "banking"
  | "suppliers"
  | "customers"
  | "staff"
  | "partners"
  | "balances"
  | "review"
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
        href: "/delivery/reports",
        label: "Reports",
        match: (path) => path.startsWith("/delivery/reports"),
      },
      {
        href: "/delivery/settlements",
        label: "Settlements",
        match: (path) => path === "/delivery/settlements",
      },
      {
        href: "/delivery/platforms",
        label: "Platforms",
        requiresDelivery: true,
        match: (path) => path === "/delivery/platforms",
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
        label: "Suppliers",
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
        label: "Customers",
        match: (path) => path === "/customers" || path.startsWith("/customers/"),
      },
    ],
  },
  {
    id: "staff",
    sidebarHref: "/staff",
    tabs: [
      {
        href: "/staff",
        label: "Staff",
        match: (path) => path === "/staff" || path.startsWith("/staff/"),
      },
    ],
  },
  {
    id: "partners",
    sidebarHref: "/partners",
    tabs: [
      {
        href: "/partners",
        label: "Partners",
        match: (path) => path === "/partners" || path.startsWith("/partners/"),
      },
    ],
  },
  {
    id: "balances",
    sidebarHref: "/balances",
    tabs: [
      {
        href: "/balances/suppliers",
        label: "Payables",
        match: (path) => path === "/balances/suppliers" || path === "/payables",
      },
      {
        href: "/balances/customers",
        label: "Receivables",
        match: (path) => path === "/balances/customers" || path === "/receivables",
      },
      {
        href: "/balances/staff",
        label: "Staff balances",
        match: (path) => path === "/balances/staff",
      },
      {
        href: "/balances/partners",
        label: "Partner balances",
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
        href: "/review/manual-journals",
        label: "Manual journals",
        requiresFinancialReports: true,
        match: (path) => path === "/review/manual-journals",
      },
    ],
  },
];

/** Routes registered in appRoutes but hidden from sidebar (reachable via tabs/cards). */
export const SIDEBAR_HIDDEN_HREFS = new Set([
  "/sales",
  "/delivery",
  "/expenses",
  "/uploads",
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
  "/review/manual-journals",
  "/banking/transfers",
  "/banking/cash",
  "/delivery/reports",
  "/delivery/settlements",
  "/delivery/platforms",
  "/accounting/manual-journals",
]);

export const REPORTS_CARD_HREFS = [
  "/reports/profit-and-loss",
  "/reports/balance-sheet",
  "/reports/cash-flow",
  "/reports/ledger",
  "/reports/kdv-input",
  "/reports/delivery-sales",
  "/reports/period-comparison",
] as const;

export type RouteEntryKind =
  | "sidebar"
  | "tab"
  | "reports-card"
  | "drill-down"
  | "auth"
  | "redirect"
  | "page";

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
  { pattern: "/review/posted", kind: "redirect" },
  { pattern: "/review/manual-journals", kind: "tab" },
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
  { pattern: "/expenses", kind: "page" },
  { pattern: "/expenses/items", kind: "page" },
  { pattern: "/uploads", kind: "redirect" },
  { pattern: "/suppliers", kind: "tab" },
  { pattern: "/suppliers/[id]", kind: "drill-down" },
  { pattern: "/payables", kind: "redirect" },
  { pattern: "/staff", kind: "tab" },
  { pattern: "/staff/[id]", kind: "drill-down" },
  { pattern: "/partners", kind: "tab" },
  { pattern: "/partners/[id]", kind: "drill-down" },
  { pattern: "/customers", kind: "tab" },
  { pattern: "/customers/[id]", kind: "drill-down" },
  { pattern: "/receivables", kind: "redirect" },
  { pattern: "/banking", kind: "tab" },
  { pattern: "/banking/review", kind: "redirect" },
  { pattern: "/banking/transfers", kind: "tab" },
  { pattern: "/banking/cash", kind: "tab" },
  { pattern: "/banking/accounts/[id]", kind: "drill-down" },
  { pattern: "/banking/accounts/[id]/import", kind: "drill-down" },
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
  { pattern: "/accounting/manual-journals", kind: "redirect" },
  { pattern: "/setup", kind: "redirect" },
  { pattern: "/setup/restaurant", kind: "redirect" },
  { pattern: "/setup/opening-balances", kind: "redirect" },
  { pattern: "/setup/members", kind: "redirect" },
  { pattern: "/setup/expense-items", kind: "redirect" },
  { pattern: "/setup/delivery-platforms", kind: "redirect" },
  { pattern: "/setup/accounts", kind: "redirect" },
  { pattern: "/setup/accountant", kind: "redirect" },
  { pattern: "/setup/backups", kind: "redirect" },
  { pattern: "/settings", kind: "redirect" },
  { pattern: "/settings/entity", kind: "redirect" },
  { pattern: "/settings/opening-balances", kind: "redirect" },
  { pattern: "/settings/members", kind: "redirect" },
  { pattern: "/settings/expense-items", kind: "redirect" },
  { pattern: "/settings/restaurant", kind: "page" },
  { pattern: "/settings/profile", kind: "page" },
  { pattern: "/onboarding/opening-balances", kind: "page" },
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
    if (section.id === "balances") {
      return (
        section.tabs.some((tab) => tab.match(pathname)) ||
        pathnameMatchesBalancesIntent(pathname)
      );
    }
    return section.tabs.some((tab) => tab.match(pathname));
  }
  if (sidebarHref === "/") return pathname === "/";
  if (sidebarHref === "/record") return pathnameMatchesRecordIntent(pathname);
  if (sidebarHref === "/suppliers") {
    return pathname === "/suppliers" || pathname.startsWith("/suppliers/");
  }
  if (sidebarHref === "/review") {
    return (
      pathname === "/review" ||
      pathname.startsWith("/review/") ||
      pathname === "/banking/review"
    );
  }
  if (sidebarHref === "/balances") {
    return pathnameMatchesBalancesIntent(pathname);
  }
  if (sidebarHref === "/reports") {
    return pathname === "/reports" || pathname.startsWith("/reports/");
  }
  return pathname === sidebarHref || pathname.startsWith(`${sidebarHref}/`);
}

export function pageTitleForPathname(pathname: string): string {
  if (pathname.startsWith("/delivery/reports/") && pathname !== "/delivery/reports") {
    return "Review delivery report";
  }
  const tab = NAV_SECTIONS.flatMap((s) => s.tabs).find((t) => t.match(pathname));
  if (tab && tab.href !== "/delivery") {
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
    "/review/manual-journals": "Manual journals",
    "/reports/ledger": "General ledger",
    "/balances": "Balances",
    "/balances/suppliers": "Payables",
    "/balances/customers": "Receivables",
    "/balances/staff": "Staff balances",
    "/balances/partners": "Partner balances",
    "/balances/cash": "Balances",
    "/expenses": "Expenses",
    "/expenses/items": "Expense items",
    "/uploads": "Documents",
    "/suppliers": "Suppliers",
    "/customers": "Customers",
    "/staff": "Staff",
    "/partners": "Partners",
    "/banking": "Banking",
    "/reports": "Reports",
    "/settings/restaurant": "Restaurant settings",
    "/settings/profile": "Your profile",
    "/onboarding/opening-balances": "Opening balances",
    "/delivery": "Delivery",
    "/delivery/platforms": "Platforms",
    "/sales": "Daily sales",
  };
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/staff/")) return "Staff member";
  if (pathname.startsWith("/partners/")) return "Partner";
  if (pathname.startsWith("/suppliers/")) return "Supplier";
  if (pathname.startsWith("/customers/")) return "Customer";
  if (pathname.startsWith("/banking/accounts/") && pathname.endsWith("/import")) {
    return "Import statement";
  }
  if (pathname.startsWith("/banking/accounts/")) return "Account";
  if (pathname.startsWith("/banking/statements/")) return "Statement review";
  if (pathname.startsWith("/banking/fx/")) return "FX wallet";
  if (pathname.startsWith("/sales/")) return "Review daily sales";
  if (pathname.startsWith("/review/receipts/")) return "Review expense receipt";
  if (pathname.startsWith("/review/invoices/")) return "Review supplier invoice";
  if (pathname.startsWith("/reports/")) return "Report";
  return "Mizan";
}
