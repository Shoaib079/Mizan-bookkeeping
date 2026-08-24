/** Tab sections for the app IA (sidebar parent + section tabs). */

import type { NavSection } from "@/lib/nav-section-types";

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
      // Close day lives in Add only (drawer count) — Sales tab removed 2026-07-31.
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
        label: "Delivery platforms",
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
          path === "/banking/banks" ||
          path === "/banking/cards" ||
          path === "/banking/fx" ||
          path.startsWith("/banking/fx/") ||
          path.startsWith("/banking/accounts/") ||
          path.startsWith("/banking/statements/"),
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
        match: (path) =>
          path === "/suppliers" ||
          path.startsWith("/suppliers/") ||
          path === "/payables",
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
        match: (path) =>
          path === "/customers" ||
          path === "/receivables" ||
          (/^\/customers\/[0-9a-f-]{36}$/i.test(path) &&
            !path.startsWith("/customers/group-")),
      },
      {
        href: "/customers/group-menus",
        label: "Group menus",
        match: (path) => path.startsWith("/customers/group-menus"),
      },
      {
        href: "/customers/dishes",
        label: "Dishes",
        match: (path) => path.startsWith("/customers/dishes"),
      },
      {
        href: "/customers/group-sales",
        label: "Group sales",
        match: (path) => path.startsWith("/customers/group-sales"),
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
        href: "/review/expenses",
        label: "Expenses",
        match: (path) => path === "/review/expenses",
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
