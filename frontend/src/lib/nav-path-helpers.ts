/** Path helpers for section match, sidebar active, titles, back links. */

import { pathnameMatchesRecordIntent } from "@/lib/intent-nav";
import type {
  NavSection,
  NavSectionId,
  PageBackLink,
} from "@/lib/nav-section-types";
import { NAV_SECTIONS } from "@/lib/nav-sections-data";

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
  if (sidebarHref === "/") {
    return (
      pathname === "/" ||
      pathname === "/balances" ||
      pathname.startsWith("/balances/")
    );
  }
  if (sidebarHref === "/record") return pathnameMatchesRecordIntent(pathname);
  if (sidebarHref === "/review") {
    return (
      pathname === "/review" ||
      pathname.startsWith("/review/") ||
      pathname === "/banking/review"
    );
  }
  if (sidebarHref === "/reports") {
    return pathname === "/reports" || pathname.startsWith("/reports/");
  }
  if (sidebarHref === "/settings/restaurant") {
    return (
      pathname === "/settings/restaurant" ||
      pathname.startsWith("/settings/") ||
      pathname === "/onboarding/opening-balances"
    );
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
    "/review/expenses": "Expenses",
    "/review/delivery": "Review",
    "/review/manual-journals": "Manual journals",
    "/reports/ledger": "General ledger",
    "/expenses": "Expenses",
    "/expenses/items": "Expense items",
    "/uploads": "Documents",
    "/suppliers": "Suppliers",
    "/customers": "Customers",
    "/customers/group-menus": "Group menus",
    "/customers/group-menus/[id]": "Menu",
    "/customers/dishes": "Dishes",
    "/customers/group-sales": "Group sales",
    "/staff": "Staff",
    "/partners": "Partners",
    "/banking": "Banking",
    "/banking/banks": "Banks",
    "/banking/cards": "Credit cards",
    "/banking/fx": "Foreign currency",
    "/reports": "Reports",
    "/settings/restaurant": "Restaurant settings",
    "/settings/profile": "Your profile",
    "/onboarding/opening-balances": "Opening balances",
    "/delivery": "Delivery",
    "/delivery/platforms": "Delivery platforms",
    "/sales": "Daily sales",
  };
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/staff/")) return "Staff member";
  if (pathname.startsWith("/partners/")) return "Partner";
  if (pathname.startsWith("/suppliers/")) return "Supplier";
  if (
    pathname.startsWith("/customers/group-sales/") &&
    pathname !== "/customers/group-sales"
  ) {
    return "Group sale";
  }
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

/** Parent link for drill-down and nested pages. Returns null on hubs and dynamic-parent pages. */
export function backLinkForPathname(pathname: string): PageBackLink | null {
  // Statement review resolves account id after load — keep page-local back link.
  if (pathname.startsWith("/banking/statements/")) return null;

  const importMatch = pathname.match(/^\/banking\/accounts\/([^/]+)\/import$/);
  if (importMatch) {
    return {
      href: `/banking/accounts/${importMatch[1]}`,
      label: "Account",
    };
  }

  const rules: {
    test: (path: string) => boolean;
    href: string;
    label: string;
  }[] = [
    {
      test: (path) => /^\/sales\/[^/]+$/.test(path),
      href: "/sales",
      label: "Daily sales",
    },
    {
      test: (path) => /^\/review\/invoices\/[^/]+$/.test(path),
      href: "/review/invoices",
      label: "Invoices",
    },
    {
      test: (path) => /^\/review\/receipts\/[^/]+$/.test(path),
      href: "/review/receipts",
      label: "Receipts",
    },
    {
      test: (path) => /^\/suppliers\/[^/]+$/.test(path),
      href: "/suppliers",
      label: "All suppliers",
    },
    {
      test: (path) => /^\/staff\/[^/]+$/.test(path),
      href: "/staff",
      label: "Staff",
    },
    {
      test: (path) => /^\/partners\/[^/]+$/.test(path),
      href: "/partners",
      label: "Partners",
    },
    {
      test: (path) =>
        /^\/customers\/[0-9a-f-]{36}$/i.test(path) &&
        !path.startsWith("/customers/group-"),
      href: "/customers",
      label: "Customers",
    },
    {
      test: (path) => /^\/customers\/group-sales\/[^/]+$/.test(path),
      href: "/customers/group-sales",
      label: "Group sales",
    },
    {
      test: (path) => /^\/banking\/accounts\/[^/]+$/.test(path),
      href: "/banking",
      label: "Banking",
    },
    {
      test: (path) => /^\/banking\/fx\/[^/]+$/.test(path),
      href: "/banking/fx",
      label: "Foreign currency",
    },
    {
      test: (path) => path === "/banking/banks" || path === "/banking/cards",
      href: "/banking",
      label: "Banking",
    },
    {
      test: (path) => path === "/banking/fx",
      href: "/banking",
      label: "Banking",
    },
    {
      test: (path) => path === "/banking/cash",
      href: "/banking",
      label: "Banking",
    },
    {
      test: (path) => path === "/onboarding/opening-balances",
      href: "/settings/restaurant",
      label: "Settings",
    },
    {
      test: (path) => path.startsWith("/reports/") && path !== "/reports",
      href: "/reports",
      label: "Reports",
    },
    {
      test: (path) => path === "/expenses/items",
      href: "/review/expenses?view=items",
      label: "Expenses",
    },
  ];

  for (const rule of rules) {
    if (rule.test(pathname)) {
      return { href: rule.href, label: rule.label };
    }
  }

  return null;
}
